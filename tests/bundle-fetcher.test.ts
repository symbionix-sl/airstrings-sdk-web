import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BundleFetcher, HttpError } from '../src/networking/bundle-fetcher'
import { noopLogger } from '../src/types'

describe('BundleFetcher', () => {
  const fetcher = new BundleFetcher('https://cdn.airstrings.com')
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns success with body and etag on 200', async () => {
    const body = '{"format_version":1,"strings":{}}'
    fetchMock.mockResolvedValueOnce(new Response(body, {
      status: 200,
      headers: { ETag: '"rev:42"' },
    }))

    const result = await fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', null, noopLogger)
    expect(result.status).toBe('success')
    expect(result.json).toBe(body)
    expect(result.etag).toBe('"rev:42"')
  })

  it('returns not_modified on 304', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    const result = await fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', '"rev:42"', noopLogger)
    expect(result.status).toBe('not_modified')
  })

  it('sends If-None-Match header when etag provided', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    await fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', '"rev:42"', noopLogger)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cdn.airstrings.com/org_test12345678/proj_test/env_test12345678/en/bundle.json')
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"rev:42"')
  })

  it('does not send If-None-Match when no etag', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', null, noopLogger)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['If-None-Match']).toBeUndefined()
  })

  it('throws on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'))

    await expect(
      fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', null, noopLogger),
    ).rejects.toThrow('Network failure')
  })

  it('throws on non-ok HTTP status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Not Found', {
      status: 404,
      statusText: 'Not Found',
    }))

    await expect(
      fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', null, noopLogger),
    ).rejects.toThrow('HTTP 404')
  })

  it('handles null etag in response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"strings":{}}', {
      status: 200,
    }))

    const result = await fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', null, noopLogger)
    expect(result.status).toBe('success')
    expect(result.etag).toBeNull()
  })
})

describe('BundleFetcher failover', () => {
  const CDN = 'https://cdn.airstrings.com'
  const FALLBACK = 'https://api.airstrings.com/v1/bundles'
  const PATH = '/org_test12345678/proj_test/env_test12345678/en/bundle.json'
  const BODY = '{"format_version":1,"strings":{}}'

  type Handler = (init?: RequestInit) => Promise<Response>

  let fetchMock: ReturnType<typeof vi.fn>

  const aborted = () => new DOMException('The operation was aborted.', 'AbortError')

  const hang: Handler = (init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(aborted()))
  })

  const status = (code: number): Handler => () => Promise.resolve(new Response(code === 304 ? null : 'x', { status: code }))

  const ok = (body = BODY): Handler => () => Promise.resolve(new Response(body, { status: 200 }))

  const networkError: Handler = () => Promise.reject(new TypeError('fetch failed'))

  const slowBody = (delay: number): Handler => (init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(BODY))
          controller.close()
        }, delay)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          controller.error(aborted())
        })
      },
    })
    return Promise.resolve(new Response(stream, { status: 200 }))
  }

  const brokenBody: Handler = () => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new TypeError('terminated'))
    },
  }), { status: 200 }))

  const route = (routes: { cdn: Handler | Handler[], fallback?: Handler | Handler[] }) => {
    const queues = new Map<string, Handler[]>([
      [CDN, [routes.cdn].flat()],
      [FALLBACK, routes.fallback ? [routes.fallback].flat() : []],
    ])
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      for (const [prefix, handlers] of queues) {
        if (url.startsWith(prefix)) {
          const handler = handlers.length > 1 ? handlers.shift() : handlers[0]
          if (handler) return handler(init)
        }
      }
      return Promise.reject(new Error(`unrouted ${url}`))
    })
  }

  const calledURLs = () => fetchMock.mock.calls.map((c) => c[0] as string)

  const fetchBundle = (fetcher: BundleFetcher, ifNoneMatch: string | null = null, logger = noopLogger) =>
    fetcher.fetch('org_test12345678', 'proj_test', 'env_test12345678', 'en', ifNoneMatch, logger)

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses only the CDN on success', async () => {
    route({ cdn: ok(), fallback: ok('{}') })

    const result = await fetchBundle(new BundleFetcher(CDN, FALLBACK))

    expect(result).toMatchObject({ status: 'success', json: BODY })
    expect(calledURLs()).toEqual([CDN + PATH])
  })

  it('fails over after 5s without response headers', async () => {
    vi.useFakeTimers()
    route({ cdn: hang, fallback: ok() })
    const logger = vi.fn()

    const promise = fetchBundle(new BundleFetcher(CDN, FALLBACK), null, logger)
    await vi.advanceTimersByTimeAsync(4999)
    expect(calledURLs()).toEqual([CDN + PATH])

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toMatchObject({ status: 'success', json: BODY })
    expect(calledURLs()).toEqual([CDN + PATH, FALLBACK + PATH])
    expect(logger).toHaveBeenCalledWith('warn', 'Bundle fetch failed, retrying on fallback host', {
      host: CDN,
      fallbackHost: FALLBACK,
    })
  })

  it('keeps the 30s budget once headers arrive', async () => {
    vi.useFakeTimers()
    route({ cdn: slowBody(6000), fallback: ok('{}') })

    const promise = fetchBundle(new BundleFetcher(CDN, FALLBACK))
    await vi.advanceTimersByTimeAsync(6000)

    await expect(promise).resolves.toMatchObject({ status: 'success', json: BODY })
    expect(calledURLs()).toEqual([CDN + PATH])
  })

  it('fails over on network error', async () => {
    route({ cdn: networkError, fallback: ok() })

    const result = await fetchBundle(new BundleFetcher(CDN, FALLBACK))

    expect(result).toMatchObject({ status: 'success', json: BODY })
    expect(calledURLs()).toEqual([CDN + PATH, FALLBACK + PATH])
  })

  it('fails over on 5xx', async () => {
    route({ cdn: status(503), fallback: ok() })

    const result = await fetchBundle(new BundleFetcher(CDN, FALLBACK))

    expect(result).toMatchObject({ status: 'success', json: BODY })
    expect(calledURLs()).toEqual([CDN + PATH, FALLBACK + PATH])
  })

  it('fails over when the CDN body cannot be read', async () => {
    route({ cdn: brokenBody, fallback: ok() })

    const result = await fetchBundle(new BundleFetcher(CDN, FALLBACK))

    expect(result).toMatchObject({ status: 'success', json: BODY })
    expect(calledURLs()).toEqual([CDN + PATH, FALLBACK + PATH])
  })

  it.each([404, 304])('does not fail over on %i', async (code) => {
    route({ cdn: status(code), fallback: ok() })

    const outcome = await fetchBundle(new BundleFetcher(CDN, FALLBACK), '"rev:42"').then(
      (r) => r.status,
      (e: unknown) => (e instanceof HttpError ? e.status : e),
    )

    expect(outcome).toBe(code === 304 ? 'not_modified' : 404)
    expect(calledURLs()).toEqual([CDN + PATH])
  })

  it('has no 5s deadline without a fallback', async () => {
    vi.useFakeTimers()
    route({ cdn: hang })
    let settled = 'pending'

    const promise = fetchBundle(new BundleFetcher(CDN)).then(
      () => { settled = 'resolved' },
      (e: unknown) => { settled = (e as Error).name },
    )
    await vi.advanceTimersByTimeAsync(5000)
    expect(settled).toBe('pending')

    await vi.advanceTimersByTimeAsync(25000)
    await promise
    expect(settled).toBe('AbortError')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('throws when both hosts fail', async () => {
    route({ cdn: status(500), fallback: networkError })
    const logger = vi.fn()

    await expect(fetchBundle(new BundleFetcher(CDN, FALLBACK), null, logger)).rejects.toThrow('fetch failed')
    expect(calledURLs()).toEqual([CDN + PATH, FALLBACK + PATH])
    expect(logger).toHaveBeenCalledWith('error', 'Fetch failed for en', { url: FALLBACK + PATH, error: 'fetch failed' })
  })

  it('keeps using the fallback after a successful failover', async () => {
    route({ cdn: [networkError, ok()], fallback: ok() })
    const fetcher = new BundleFetcher(CDN, FALLBACK)

    await fetchBundle(fetcher)
    await fetchBundle(fetcher)

    expect(calledURLs()).toEqual([CDN + PATH, FALLBACK + PATH, FALLBACK + PATH])
  })

  it.each(['"rev:42"', 'W/"rev:42"'])('sends If-None-Match %s unchanged to the fallback', async (etag) => {
    route({ cdn: networkError, fallback: status(304) })

    const result = await fetchBundle(new BundleFetcher(CDN, FALLBACK), etag)

    expect(result.status).toBe('not_modified')
    const sent = fetchMock.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)['If-None-Match'])
    expect(sent).toEqual([etag, etag])
  })
})
