import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BundleFetcher } from '../src/networking/bundle-fetcher'
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

    const result = await fetcher.fetch('proj_test', 'en', null, noopLogger)
    expect(result.status).toBe('success')
    expect(result.json).toBe(body)
    expect(result.etag).toBe('"rev:42"')
  })

  it('returns not_modified on 304', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    const result = await fetcher.fetch('proj_test', 'en', '"rev:42"', noopLogger)
    expect(result.status).toBe('not_modified')
  })

  it('sends If-None-Match header when etag provided', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }))

    await fetcher.fetch('proj_test', 'en', '"rev:42"', noopLogger)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://cdn.airstrings.com/v1/proj_test/en/bundle.json')
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"rev:42"')
  })

  it('does not send If-None-Match when no etag', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await fetcher.fetch('proj_test', 'en', null, noopLogger)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['If-None-Match']).toBeUndefined()
  })

  it('throws on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'))

    await expect(
      fetcher.fetch('proj_test', 'en', null, noopLogger),
    ).rejects.toThrow('Network failure')
  })

  it('throws on non-ok HTTP status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Not Found', {
      status: 404,
      statusText: 'Not Found',
    }))

    await expect(
      fetcher.fetch('proj_test', 'en', null, noopLogger),
    ).rejects.toThrow('HTTP 404')
  })

  it('handles null etag in response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"strings":{}}', {
      status: 200,
    }))

    const result = await fetcher.fetch('proj_test', 'en', null, noopLogger)
    expect(result.status).toBe('success')
    expect(result.etag).toBeNull()
  })
})
