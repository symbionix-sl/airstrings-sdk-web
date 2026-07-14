import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as ed from '@noble/ed25519'
import { AirStrings, ExposureEvent } from '../src/airstrings'
import { AirStringsConfig } from '../src/airstrings-config'
import { signedContent, experimentsSignedContent } from '../src/models/canonical-json'
import { encode as base64urlEncode } from '../src/security/base64url'
import { MemoryStore } from '../src/storage/memory-store'
import { StringBundle } from '../src/models/string-bundle'

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function makeConfig(overrides?: Partial<AirStringsConfig>): AirStringsConfig {
  return {
    organizationId: 'org_test12345678',
    projectId: 'proj_test12345678',
    environmentId: 'env_test12345678',
    publicKeys: [],
    locale: 'en',
    store: new MemoryStore(),
    ...overrides,
  }
}

async function makeSignedBundleJSON(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  overrides?: Partial<StringBundle>,
): Promise<{ json: string; config: AirStringsConfig }> {
  const publicKeyBase64 = toBase64(publicKey)

  const bundle: StringBundle = {
    format_version: 1,
    project_id: 'proj_test12345678',
    locale: 'en',
    revision: 1,
    created_at: '2026-02-25T14:30:00Z',
    key_id: publicKeyBase64,
    signature: '',
    strings: {
      greeting: { value: 'Hello!', format: 'text' },
      farewell: { value: 'Goodbye!', format: 'text' },
    },
    ...overrides,
  }

  const canonicalBytes = signedContent(bundle)
  const signatureBytes = await ed.signAsync(canonicalBytes, privateKey)
  const signatureBase64url = base64urlEncode(signatureBytes)

  const signed = { ...bundle, signature: signatureBase64url }
  const store = new MemoryStore()
  const config = makeConfig({
    publicKeys: [publicKeyBase64],
    store,
  })

  return { json: JSON.stringify(signed), config }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function makeExperimentsBundleJSON(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  opts?: { tamperExpSig?: boolean; omitExpSig?: boolean; revision?: number },
): Promise<{ json: string; publicKeyBase64: string }> {
  const publicKeyBase64 = toBase64(publicKey)

  const bundle: StringBundle = {
    format_version: 1,
    project_id: 'proj_test12345678',
    locale: 'en',
    revision: opts?.revision ?? 1,
    created_at: '2026-02-25T14:30:00Z',
    key_id: publicKeyBase64,
    signature: '',
    strings: {
      cta: {
        value: 'Base CTA',
        format: 'text',
        experiment: { id: 'exp_cta', allocation: { treatment: 100 }, variants: { treatment: 'Variant CTA' } },
      },
      banner: {
        value: 'Base Banner',
        format: 'text',
        experiment: { id: 'exp_banner', allocation: { control: 100 }, variants: {} },
      },
      plain: { value: 'Plain', format: 'text' },
    },
  }

  const signature = base64urlEncode(await ed.signAsync(signedContent(bundle), privateKey))

  let experimentsSig: string | undefined
  if (!opts?.omitExpSig) {
    const content = opts?.tamperExpSig
      ? new TextEncoder().encode('tampered')
      : experimentsSignedContent(bundle)
    experimentsSig = base64urlEncode(await ed.signAsync(content, privateKey))
  }

  const signed = experimentsSig
    ? { ...bundle, signature, experiments_signature: experimentsSig }
    : { ...bundle, signature }

  return { json: JSON.stringify(signed), publicKeyBase64 }
}

describe('AirStrings', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('t() returns key name as fallback when no strings loaded', () => {
    const airstrings = new AirStrings(makeConfig())
    expect(airstrings.t('nonexistent.key')).toBe('nonexistent.key')
    expect(airstrings.t('onboarding.title')).toBe('onboarding.title')
  })

  it('initial state has correct defaults', () => {
    const airstrings = new AirStrings(makeConfig({ locale: 'en' }))
    expect(airstrings.locale).toBe('en')
    expect(airstrings.revision).toBe(0)
    expect(airstrings.strings).toEqual({})
  })

  it('uses configured locale', () => {
    const airstrings = new AirStrings(makeConfig({ locale: 'it' }))
    expect(airstrings.locale).toBe('it')
  })

  it('serves strings from cache on init', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, config } = await makeSignedBundleJSON(privateKey, publicKey)

    // Pre-populate the store
    await config.store!.save('proj_test12345678', 'env_test12345678', 'en', {
      json,
      etag: '"rev:1"',
    })

    const airstrings = new AirStrings(config)

    // Wait for async init to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(airstrings.t('farewell')).toBe('Goodbye!')
    expect(airstrings.isReady).toBe(true)
  })

  it('emits strings:updated on successful refresh', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json } = await makeSignedBundleJSON(privateKey, publicKey)

    // Bootstrap response (returns CDN URL)
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ cdn_base_url: 'https://cdn.airstrings.com' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    fetchMock.mockResolvedValueOnce(new Response(json, {
      status: 200,
      headers: { ETag: '"rev:1"' },
    }))

    const store = new MemoryStore()
    const config = makeConfig({
      publicKeys: [toBase64(publicKey)],
      store,
    })

    const airstrings = new AirStrings(config)
    const updates: { locale: string; revision: number }[] = []
    airstrings.on('strings:updated', (data) => updates.push(data))

    // Wait for init + refresh
    await new Promise(resolve => setTimeout(resolve, 200))

    expect(updates.length).toBeGreaterThanOrEqual(1)
    expect(updates[0]!.locale).toBe('en')
    expect(updates[0]!.revision).toBe(1)
  })

  it('anti-downgrade: ignores stale bundles', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)

    // First bundle at revision 5
    const { json: json5 } = await makeSignedBundleJSON(privateKey, publicKey, {
      revision: 5,
    })

    // Second bundle at revision 3 (stale)
    const { json: json3 } = await makeSignedBundleJSON(privateKey, publicKey, {
      revision: 3,
    })

    // Bootstrap response
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ cdn_base_url: 'https://cdn.airstrings.com' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    // First fetch returns rev 5
    fetchMock.mockResolvedValueOnce(new Response(json5, {
      status: 200,
      headers: { ETag: '"rev:5"' },
    }))

    const store = new MemoryStore()
    const config = makeConfig({
      publicKeys: [toBase64(publicKey)],
      store,
    })

    const airstrings = new AirStrings(config)
    await new Promise(resolve => setTimeout(resolve, 200))

    expect(airstrings.revision).toBe(5)

    // Second fetch returns rev 3 (stale)
    fetchMock.mockResolvedValueOnce(new Response(json3, {
      status: 200,
      headers: { ETag: '"rev:3"' },
    }))

    await airstrings.refresh()
    expect(airstrings.revision).toBe(5) // Should not downgrade
  })

  it('destroy removes visibility listener', () => {
    const removeEventListenerSpy = vi.fn()
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerSpy,
    })

    const airstrings = new AirStrings(makeConfig())
    airstrings.destroy()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  })

  it('strings getter returns raw values (backward compat)', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, config } = await makeSignedBundleJSON(privateKey, publicKey, {
      strings: {
        hello: { value: 'Hello!', format: 'text' },
        count: { value: '{n, plural, one {# item} other {# items}}', format: 'icu' },
      },
    })

    await config.store!.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(config)
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(airstrings.strings['hello']).toBe('Hello!')
    expect(airstrings.strings['count']).toBe('{n, plural, one {# item} other {# items}}')
    expect(airstrings.t('hello')).toBe('Hello!')
    expect(airstrings.t('count')).toBe('{n, plural, one {# item} other {# items}}')
  })

  it('format() returns value as-is for text format', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, config } = await makeSignedBundleJSON(privateKey, publicKey, {
      strings: {
        hello: { value: 'Hello!', format: 'text' },
      },
    })

    await config.store!.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(config)
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(airstrings.format('hello')).toBe('Hello!')
    expect(airstrings.format('hello', { unused: 'arg' })).toBe('Hello!')
  })

  it('format() formats ICU plural patterns', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, config } = await makeSignedBundleJSON(privateKey, publicKey, {
      strings: {
        'items.count': { value: '{count, plural, one {# item} other {# items}}', format: 'icu' },
      },
    })

    await config.store!.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(config)
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(airstrings.format('items.count', { count: 1 })).toBe('1 item')
    expect(airstrings.format('items.count', { count: 5 })).toBe('5 items')
  })

  it('format() formats ICU select patterns', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, config } = await makeSignedBundleJSON(privateKey, publicKey, {
      strings: {
        status: { value: '{status, select, active {Active} inactive {Inactive} other {Unknown}}', format: 'icu' },
      },
    })

    await config.store!.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(config)
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(airstrings.format('status', { status: 'active' })).toBe('Active')
    expect(airstrings.format('status', { status: 'inactive' })).toBe('Inactive')
    expect(airstrings.format('status', { status: 'deleted' })).toBe('Unknown')
  })

  it('format() returns key name for missing key', () => {
    const airstrings = new AirStrings(makeConfig())
    expect(airstrings.format('missing.key', { count: 1 })).toBe('missing.key')
  })

  it('whenReady resolves after init + initial refresh (guards race)', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json } = await makeSignedBundleJSON(privateKey, publicKey)

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ cdn_base_url: 'https://cdn.airstrings.com' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    fetchMock.mockResolvedValueOnce(new Response(json, {
      status: 200,
      headers: { ETag: '"rev:1"' },
    }))

    const airstrings = new AirStrings(makeConfig({
      publicKeys: [toBase64(publicKey)],
      store: new MemoryStore(),
    }))

    await airstrings.whenReady()

    expect(airstrings.isReady).toBe(true)
    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(airstrings.revision).toBe(1)
  })

  it('logs error when bundle fetch returns 500', async () => {
    // Bootstrap OK, bundle fetch returns 500
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ cdn_base_url: 'https://cdn.airstrings.com' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))

    const logger = vi.fn()
    const airstrings = new AirStrings(makeConfig({ logger }))
    await airstrings.whenReady()

    const errorCalls = logger.mock.calls.filter((c) => c[0] === 'error')
    expect(errorCalls.length).toBeGreaterThanOrEqual(1)
    expect(errorCalls.some((c) => /Refresh failed/.test(String(c[1])))).toBe(true)
  })

  it('logs error when bootstrap aborts via timeout', async () => {
    // Bootstrap hangs until the AbortController signal fires
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }
      })
    })

    const logger = vi.fn()
    vi.useFakeTimers()
    try {
      const airstrings = new AirStrings(makeConfig({ logger }))
      // Advance past the 30s bootstrap timeout
      await vi.advanceTimersByTimeAsync(30000)
      vi.useRealTimers()
      await airstrings.whenReady()

      const errorCalls = logger.mock.calls.filter((c) => c[0] === 'error')
      expect(errorCalls.some((c) => /Bootstrap failed/.test(String(c[1])))).toBe(true)
    } finally {
      if (vi.isFakeTimers()) vi.useRealTimers()
    }
  })

  it('logs error when cached bundle has wrong key_id', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json } = await makeSignedBundleJSON(privateKey, publicKey)

    // Configure with a DIFFERENT public key so cache verification fails
    const otherPriv = ed.utils.randomPrivateKey()
    const otherPub = await ed.getPublicKeyAsync(otherPriv)

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', {
      json,
      etag: '"rev:1"',
    })

    const logger = vi.fn()
    const airstrings = new AirStrings(makeConfig({
      publicKeys: [toBase64(otherPub)],
      store,
      logger,
    }))
    await airstrings.whenReady()

    const errorCalls = logger.mock.calls.filter((c) => c[0] === 'error')
    expect(errorCalls.some((c) => /verification failed/i.test(String(c[1])))).toBe(true)
  })

  it('format() returns raw pattern on formatting failure', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, config } = await makeSignedBundleJSON(privateKey, publicKey, {
      strings: {
        bad: { value: '{count, plural, one {# item} other {# items}', format: 'icu' },
      },
    })

    await config.store!.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(config)
    await new Promise(resolve => setTimeout(resolve, 100))

    // Malformed ICU pattern (missing closing brace) — should return raw value
    expect(airstrings.format('bad', { count: 1 })).toBe('{count, plural, one {# item} other {# items}')
  })
})

describe('AirStrings experiments', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serves the selected variant when experiments are signed and assignmentId is set', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey)

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: '"rev:1"' })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store }))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    expect(airstrings.t('cta')).toBe('Variant CTA')
    expect(airstrings.t('banner')).toBe('Base Banner')
    expect(airstrings.t('plain')).toBe('Plain')
    expect(airstrings.format('cta')).toBe('Variant CTA')
  })

  it('serves base values and emits no exposure when no assignmentId is set', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey)

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store }))
    const exposures: ExposureEvent[] = []
    airstrings.on('experiment:exposure', (e) => exposures.push(e))
    await airstrings.whenReady()

    expect(airstrings.t('cta')).toBe('Base CTA')
    expect(airstrings.t('banner')).toBe('Base Banner')
    await tick()
    expect(exposures).toHaveLength(0)
  })

  it('serves base values but still applies the bundle when experiments_signature is tampered', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey, { tamperExpSig: true })

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store }))
    const exposures: ExposureEvent[] = []
    airstrings.on('experiment:exposure', (e) => exposures.push(e))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    expect(airstrings.t('cta')).toBe('Base CTA')
    expect(airstrings.t('plain')).toBe('Plain')
    expect(airstrings.isReady).toBe(true)
    await tick()
    expect(exposures).toHaveLength(0)
  })

  it('serves base values but still applies the bundle when experiments_signature is absent', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey, { omitExpSig: true })

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store }))
    const exposures: ExposureEvent[] = []
    airstrings.on('experiment:exposure', (e) => exposures.push(e))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    expect(airstrings.t('cta')).toBe('Base CTA')
    expect(airstrings.t('plain')).toBe('Plain')
    expect(airstrings.isReady).toBe(true)
    await tick()
    expect(exposures).toHaveLength(0)
  })

  it('fires exactly one exposure per (key,experiment,variant,assignment), deduped across reads and re-applies', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey)

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store }))
    const exposures: ExposureEvent[] = []
    airstrings.on('experiment:exposure', (e) => exposures.push(e))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    airstrings.t('cta')
    airstrings.t('cta')
    airstrings.t('banner')
    airstrings.t('banner')
    await tick()

    await airstrings.setLocale('en')
    airstrings.t('cta')
    airstrings.t('banner')
    await tick()

    const cta = exposures.filter((e) => e.key === 'cta')
    const banner = exposures.filter((e) => e.key === 'banner')
    expect(cta).toHaveLength(1)
    expect(cta[0]!.variant).toBe('treatment')
    expect(cta[0]!.experimentId).toBe('exp_cta')
    expect(cta[0]!.assignmentId).toBe('user-42')
    expect(banner).toHaveLength(1)
    expect(banner[0]!.variant).toBe('control')
    expect(banner[0]!.experimentId).toBe('exp_banner')
  })

  it('behaves identically to a pre-variants bundle even with an assignmentId set', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json } = await makeSignedBundleJSON(privateKey, publicKey)

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [toBase64(publicKey)], store }))
    const exposures: ExposureEvent[] = []
    airstrings.on('experiment:exposure', (e) => exposures.push(e))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(airstrings.t('farewell')).toBe('Goodbye!')
    await tick()
    expect(exposures).toHaveLength(0)
  })

  it('setAssignmentId after load switches the served value and emits strings:updated', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey)

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store }))
    await airstrings.whenReady()

    expect(airstrings.t('cta')).toBe('Base CTA')

    const updates: { locale: string; revision: number }[] = []
    airstrings.on('strings:updated', (d) => updates.push(d))

    airstrings.setAssignmentId('user-42')
    expect(airstrings.t('cta')).toBe('Variant CTA')
    expect(updates).toHaveLength(1)
    expect(updates[0]!.locale).toBe('en')

    airstrings.setAssignmentId(null)
    expect(airstrings.t('cta')).toBe('Base CTA')
    expect(updates).toHaveLength(2)
  })

  it('serves variants when the bundle is delivered via the seed path', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey)

    const airstrings = new AirStrings(makeConfig({
      publicKeys: [publicKeyBase64],
      store: new MemoryStore(),
      seed: [json],
    }))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    expect(airstrings.t('cta')).toBe('Variant CTA')
    expect(airstrings.t('banner')).toBe('Base Banner')
  })

  it('serves variants and fires an exposure when the bundle arrives via a network refresh', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey)

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ cdn_base_url: 'https://cdn.airstrings.com' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    fetchMock.mockResolvedValueOnce(new Response(json, {
      status: 200,
      headers: { ETag: '"rev:1"' },
    }))

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store: new MemoryStore() }))
    const exposures: ExposureEvent[] = []
    airstrings.on('experiment:exposure', (e) => exposures.push(e))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    expect(airstrings.t('cta')).toBe('Variant CTA')
    await tick()

    const cta = exposures.filter((e) => e.key === 'cta')
    expect(cta).toHaveLength(1)
    expect(cta[0]!.variant).toBe('treatment')
  })

  it('onExposure registers a handler that fires with the full payload and returns an unsubscribe fn', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, publicKeyBase64 } = await makeExperimentsBundleJSON(privateKey, publicKey)

    const store = new MemoryStore()
    await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(makeConfig({ publicKeys: [publicKeyBase64], store }))
    const exposures: ExposureEvent[] = []
    const unsubscribe = airstrings.onExposure((e) => exposures.push(e))
    airstrings.setAssignmentId('user-42')
    await airstrings.whenReady()

    airstrings.t('cta')
    await tick()

    const cta = exposures.filter((e) => e.key === 'cta')
    expect(cta).toHaveLength(1)
    expect(cta[0]!).toEqual({
      key: 'cta',
      experimentId: 'exp_cta',
      variant: 'treatment',
      locale: 'en',
      assignmentId: 'user-42',
    })

    unsubscribe()

    airstrings.setAssignmentId('user-99')
    airstrings.t('cta')
    await tick()

    expect(exposures.filter((e) => e.assignmentId === 'user-99')).toHaveLength(0)
  })
})
