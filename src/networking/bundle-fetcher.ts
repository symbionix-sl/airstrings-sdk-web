import { Logger } from '../types'

export interface FetchResult {
  readonly status: 'success' | 'not_modified'
  readonly json?: string
  readonly etag?: string | null
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, statusText: string) {
    super(`HTTP ${status}: ${statusText}`)
    this.status = status
  }
}

export class BundleFetcher {
  private hosts: [string, string | null]
  private readonly firstAttemptTimeout: number
  private readonly timeout: number

  constructor(baseURL: string, fallbackURL: string | null = null, firstAttemptTimeout = 5000, timeout = 30000) {
    this.hosts = [baseURL.replace(/\/$/, ''), fallbackURL ? fallbackURL.replace(/\/$/, '') : null]
    this.firstAttemptTimeout = firstAttemptTimeout
    this.timeout = timeout
  }

  async fetch(
    organizationId: string,
    projectId: string,
    environmentId: string,
    locale: string,
    ifNoneMatch: string | null,
    logger: Logger,
  ): Promise<FetchResult> {
    const path = `/${organizationId}/${projectId}/${environmentId}/${locale}/bundle.json`
    const headers: Record<string, string> = {}
    if (ifNoneMatch) {
      headers['If-None-Match'] = ifNoneMatch
    }

    const [host, fallbackHost] = this.hosts
    let url = `${host}${path}`

    try {
      try {
        return await this.attempt(url, headers, fallbackHost !== null)
      } catch (error) {
        if (fallbackHost === null || (error instanceof HttpError && error.status < 500)) {
          throw error
        }
        logger('warn', 'Bundle fetch failed, retrying on fallback host', { host, fallbackHost })
      }

      url = `${fallbackHost}${path}`
      const result = await this.attempt(url, headers, false)
      this.hosts = [fallbackHost, host]
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger('error', `Fetch failed for ${locale}`, { url, error: message })
      throw error
    }
  }

  private async attempt(url: string, headers: Record<string, string>, bounded: boolean): Promise<FetchResult> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)
    const headersTimeoutId = bounded ? setTimeout(() => controller.abort(), this.firstAttemptTimeout) : undefined

    try {
      let response: Response
      try {
        response = await fetch(url, {
          headers,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(headersTimeoutId)
      }

      if (response.status === 304) {
        return { status: 'not_modified' }
      }

      if (!response.ok) {
        throw new HttpError(response.status, response.statusText)
      }

      const json = await response.text()
      const etag = response.headers.get('ETag')

      return { status: 'success', json, etag }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
