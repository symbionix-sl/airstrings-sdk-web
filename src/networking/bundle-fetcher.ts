import { Logger } from '../types'

export interface FetchResult {
  readonly status: 'success' | 'not_modified'
  readonly json?: string
  readonly etag?: string | null
}

export class BundleFetcher {
  private readonly baseURL: string
  private readonly timeout: number

  constructor(baseURL: string, timeout = 30000) {
    this.baseURL = baseURL.replace(/\/$/, '')
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
    const url = `${this.baseURL}/${organizationId}/${projectId}/${environmentId}/${locale}/bundle.json`
    const headers: Record<string, string> = {}
    if (ifNoneMatch) {
      headers['If-None-Match'] = ifNoneMatch
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      })

      if (response.status === 304) {
        return { status: 'not_modified' }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const json = await response.text()
      const etag = response.headers.get('ETag')

      return { status: 'success', json, etag }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger('error', `Fetch failed for ${locale}`, { url, error: message })
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
