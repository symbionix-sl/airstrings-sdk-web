import { describe, it, expect, vi, afterEach } from 'vitest'
import * as ed from '@noble/ed25519'
import { AirStrings } from '../src/airstrings'
import { AirStringsConfig } from '../src/airstrings-config'
import { AirStringsError } from '../src/airstrings-error'
import { signedContent } from '../src/models/canonical-json'
import { encode as base64urlEncode } from '../src/security/base64url'
import { MemoryStore } from '../src/storage/memory-store'
import { StringBundle } from '../src/models/string-bundle'

const API = 'https://api.test'
const CDN = 'https://cdn.test'
const FALLBACK = 'https://fallback.test'

type Handler = (init?: RequestInit) => Promise<Response>

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

async function makeKeypair(): Promise<{ privateKey: Uint8Array; publicKeyBase64: string }> {
  const privateKey = ed.utils.randomPrivateKey()
  return { privateKey, publicKeyBase64: toBase64(await ed.getPublicKeyAsync(privateKey)) }
}

async function signBundle(
  privateKey: Uint8Array,
  keyId: string,
  overrides?: Partial<StringBundle>,
): Promise<string> {
  const bundle: StringBundle = {
    format_version: 1,
    project_id: 'proj_test12345678',
    locale: 'en',
    revision: 1,
    created_at: '2026-02-25T14:30:00Z',
    key_id: keyId,
    signature: '',
    strings: {
      greeting: { value: 'Hello!', format: 'text' },
    },
    ...overrides,
  }
  const signatureBytes = await ed.signAsync(signedContent(bundle), privateKey)
  return JSON.stringify({ ...bundle, signature: base64urlEncode(signatureBytes) })
}

function makeConfig(publicKey: string, overrides?: Partial<AirStringsConfig>): AirStringsConfig {
  return {
    organizationId: 'org_test12345678',
    projectId: 'proj_test12345678',
    environmentId: 'env_test12345678',
    publicKeys: [publicKey],
    locale: 'en',
    apiBaseURL: API,
    store: new MemoryStore(),
    ...overrides,
  }
}

async function seededStore(json: string): Promise<MemoryStore> {
  const store = new MemoryStore()
  await store.save('proj_test12345678', 'env_test12345678', 'en', { json, etag: '"rev:1"' })
  return store
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return (input as Request).url
}

function stubFetch(bootstrap: Record<string, unknown>, cdn: Handler, fallback: Handler): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
    const url = urlOf(input)
    if (url.startsWith(`${API}/`)) {
      return Promise.resolve(new Response(JSON.stringify(bootstrap), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    }
    if (url.startsWith(`${CDN}/`)) return cdn(init)
    if (url.startsWith(`${FALLBACK}/`)) return fallback(init)
    return Promise.reject(new TypeError(`Unexpected URL ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function calledOrigins(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => new URL(urlOf(c[0])).origin)
}

const withFallback = { cdn_base_url: CDN, fallback_base_url: FALLBACK }
const networkError: Handler = () => Promise.reject(new TypeError('fetch failed'))
const serve = (json: string): Handler => () => Promise.resolve(new Response(json, {
  status: 200,
  headers: { ETag: '"rev:2"' },
}))

describe('CDN failover', () => {
  afterEach(() => {
    if (vi.isFakeTimers()) vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('bootstrapFallbackUsedWhenCDNUnreachable', async () => {
    const keys = await makeKeypair()
    const json = await signBundle(keys.privateKey, keys.publicKeyBase64)
    const fetchMock = stubFetch(withFallback, networkError, serve(json))

    const airstrings = new AirStrings(makeConfig(keys.publicKeyBase64))
    await airstrings.whenReady()

    expect(airstrings.isReady).toBe(true)
    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(calledOrigins(fetchMock)).toEqual([API, CDN, FALLBACK])
  })

  it('bootstrapFallbackUsedWhenCDNHangs', async () => {
    const keys = await makeKeypair()
    const json = await signBundle(keys.privateKey, keys.publicKeyBase64)
    let cdnHit: (() => void) | undefined
    const cdnCalled = new Promise<void>((resolve) => { cdnHit = resolve })
    const hang: Handler = (init) => {
      cdnHit?.()
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    }
    const fetchMock = stubFetch(withFallback, hang, serve(json))

    vi.useFakeTimers()
    const airstrings = new AirStrings(makeConfig(keys.publicKeyBase64))
    await cdnCalled
    await vi.advanceTimersByTimeAsync(5000)
    await airstrings.whenReady()

    expect(airstrings.isReady).toBe(true)
    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(calledOrigins(fetchMock)).toEqual([API, CDN, FALLBACK])
  })

  it('bootstrapWithoutFallbackFieldLoadsFromCDN', async () => {
    const keys = await makeKeypair()
    const json = await signBundle(keys.privateKey, keys.publicKeyBase64)
    const fallback = vi.fn(networkError)
    const fetchMock = stubFetch({ cdn_base_url: CDN, some_future_field: 'x' }, serve(json), fallback)

    const airstrings = new AirStrings(makeConfig(keys.publicKeyBase64))
    await airstrings.whenReady()

    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(fallback).not.toHaveBeenCalled()
    expect(calledOrigins(fetchMock)).toEqual([API, CDN])
  })

  it('invalidSignatureFromFallbackRejectedCacheKept', async () => {
    const keys = await makeKeypair()
    const attacker = await makeKeypair()
    const cached = await signBundle(keys.privateKey, keys.publicKeyBase64)
    const forged = await signBundle(attacker.privateKey, keys.publicKeyBase64, {
      revision: 2,
      strings: { greeting: { value: 'Forged', format: 'text' } },
    })
    const fetchMock = stubFetch(withFallback, networkError, serve(forged))
    const errors: AirStringsError[] = []

    const airstrings = new AirStrings(makeConfig(keys.publicKeyBase64, { store: await seededStore(cached) }))
    airstrings.on('strings:error', ({ error }) => errors.push(error))
    await airstrings.whenReady()

    expect(errors).toHaveLength(1)
    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(airstrings.revision).toBe(1)
    expect(calledOrigins(fetchMock)).toEqual([API, CDN, FALLBACK])
  })

  it('bothHostsFailKeepsCache', async () => {
    const keys = await makeKeypair()
    const cached = await signBundle(keys.privateKey, keys.publicKeyBase64)
    const fetchMock = stubFetch(withFallback, networkError, () => Promise.resolve(new Response(null, { status: 503 })))
    const logger = vi.fn()
    const errors: AirStringsError[] = []

    const airstrings = new AirStrings(makeConfig(keys.publicKeyBase64, { store: await seededStore(cached), logger }))
    airstrings.on('strings:error', ({ error }) => errors.push(error))
    await airstrings.whenReady()

    expect(logger.mock.calls.some((c) => c[0] === 'error' && /Refresh failed/.test(String(c[1])))).toBe(true)
    expect(errors).toHaveLength(0)
    expect(airstrings.isReady).toBe(true)
    expect(airstrings.t('greeting')).toBe('Hello!')
    expect(calledOrigins(fetchMock)).toEqual([API, CDN, FALLBACK])
  })
})
