import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as ed from '@noble/ed25519'
import { AirStrings } from '../src/airstrings'
import { AirStringsConfig } from '../src/airstrings-config'
import { signedContent } from '../src/models/canonical-json'
import { encode as base64urlEncode } from '../src/security/base64url'
import { MemoryStore } from '../src/storage/memory-store'
import { StringBundle } from '../src/models/string-bundle'

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function makeConfig(overrides?: Partial<AirStringsConfig>): AirStringsConfig {
  return {
    projectId: 'proj_test12345678',
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
    await config.store!.save('proj_test12345678', 'en', {
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

    await config.store!.save('proj_test12345678', 'en', { json, etag: null })

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

    await config.store!.save('proj_test12345678', 'en', { json, etag: null })

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

    await config.store!.save('proj_test12345678', 'en', { json, etag: null })

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

    await config.store!.save('proj_test12345678', 'en', { json, etag: null })

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

  it('format() returns raw pattern on formatting failure', async () => {
    const privateKey = ed.utils.randomPrivateKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    const { json, config } = await makeSignedBundleJSON(privateKey, publicKey, {
      strings: {
        bad: { value: '{count, plural, one {# item} other {# items}', format: 'icu' },
      },
    })

    await config.store!.save('proj_test12345678', 'en', { json, etag: null })

    const airstrings = new AirStrings(config)
    await new Promise(resolve => setTimeout(resolve, 100))

    // Malformed ICU pattern (missing closing brace) — should return raw value
    expect(airstrings.format('bad', { count: 1 })).toBe('{count, plural, one {# item} other {# items}')
  })
})
