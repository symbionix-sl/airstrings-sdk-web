import { AirStringsConfig, CDN_BASE_URL } from './airstrings-config'
import { AirStringsError, airStringsError } from './airstrings-error'
import { Emitter } from './events/emitter'
import { parseBundle, StringBundle, StringEntry } from './models/string-bundle'
import { BundleFetcher } from './networking/bundle-fetcher'
import { verifyBundle } from './security/bundle-verifier'
import { BundleStore, createBundleStore } from './storage/bundle-store'
import { Logger, noopLogger } from './types'
import IntlMessageFormat from 'intl-messageformat'

export interface AirStringsEvents {
  'strings:updated': { locale: string; revision: number }
  'strings:error': { error: AirStringsError }
}

export class AirStrings {
  private readonly config: AirStringsConfig
  private readonly fetcher: BundleFetcher
  private readonly store: BundleStore
  private readonly logger: Logger
  private readonly emitter = new Emitter<AirStringsEvents>()

  private cachedETags = new Map<string, string>()
  private currentStrings: Readonly<Record<string, string>> = Object.freeze({})
  private currentEntries: Readonly<Record<string, StringEntry>> = Object.freeze({})
  private currentRevision = 0
  private currentLocale: string
  private ready = false
  private visibilityCleanup: (() => void) | null = null

  constructor(config: AirStringsConfig) {
    this.config = config
    this.logger = config.logger ?? noopLogger
    this.currentLocale = config.locale
    this.fetcher = new BundleFetcher(CDN_BASE_URL)
    this.store = createBundleStore(config.store)

    this.loadCachedBundle().then(() => {
      this.refresh()
    })

    this.observeVisibility()
  }

  /**
   * Returns the raw localized string for the given key, or the key itself as fallback.
   */
  t(key: string): string {
    return this.currentStrings[key] ?? key
  }

  /**
   * Formats a localized string with the given arguments.
   * For "text" format: returns the value as-is (ignores args).
   * For "icu" format: formats using ICU MessageFormat and returns the result.
   * On formatting failure: returns the raw pattern string (never throws).
   * If the key is not found: returns the key name as fallback.
   */
  format(key: string, args: Record<string, unknown> = {}): string {
    const entry = this.currentEntries[key]
    if (!entry) return key

    if (entry.format === 'text') return entry.value

    try {
      const msg = new IntlMessageFormat(entry.value, this.currentLocale)
      return msg.format(args) as string
    } catch {
      return entry.value
    }
  }

  get strings(): Readonly<Record<string, string>> {
    return this.currentStrings
  }

  get locale(): string {
    return this.currentLocale
  }

  get revision(): number {
    return this.currentRevision
  }

  get isReady(): boolean {
    return this.ready
  }

  on<K extends keyof AirStringsEvents>(
    event: K,
    handler: (data: AirStringsEvents[K]) => void,
  ): () => void {
    return this.emitter.on(event, handler)
  }

  async setLocale(bcp47: string): Promise<void> {
    this.currentLocale = bcp47

    const cached = await this.store.load(this.config.projectId, bcp47)
    if (cached) {
      const bundle = parseBundle(cached.json)
      if (bundle) {
        const error = await verifyBundle(bundle, this.config.publicKeys)
        if (error) {
          this.logger('error', `Cached bundle verification failed for ${bcp47}`, { code: error.code })
          await this.store.delete(this.config.projectId, bcp47)
          this.clearStrings()
        } else {
          this.applyBundle(bundle)
          this.cachedETags.set(bcp47, cached.etag ?? '')
        }
      }
    } else {
      this.clearStrings()
    }

    await this.refresh()
  }

  async refresh(): Promise<void> {
    const locale = this.currentLocale

    try {
      const result = await this.fetcher.fetch(
        this.config.projectId,
        locale,
        this.cachedETags.get(locale) ?? null,
        this.logger,
      )

      if (result.status === 'not_modified') {
        this.logger('info', `Bundle up to date: ${locale}`)
        if (!this.ready) this.ready = true
        return
      }

      if (!result.json) return

      const bundle = parseBundle(result.json)
      if (!bundle) {
        this.emitter.emit('strings:error', {
          error: airStringsError('BUNDLE_DECODE_FAILED', 'Failed to parse bundle JSON'),
        })
        return
      }

      const verifyError = await verifyBundle(bundle, this.config.publicKeys)
      if (verifyError) {
        this.logger('error', 'Signature verification failed', { code: verifyError.code })
        this.emitter.emit('strings:error', { error: verifyError })
        return
      }

      // Anti-downgrade: don't replace newer revision with older for same locale
      if (bundle.locale === this.currentLocale && bundle.revision < this.currentRevision) {
        this.logger('warn', `Ignoring stale bundle: rev ${bundle.revision} < current ${this.currentRevision}`)
        return
      }

      await this.store.save(this.config.projectId, locale, {
        json: result.json,
        etag: result.etag ?? null,
      })
      this.cachedETags.set(locale, result.etag ?? '')

      // Only apply if locale hasn't changed during fetch
      if (locale === this.currentLocale) {
        this.applyBundle(bundle)
        this.ready = true
        this.emitter.emit('strings:updated', { locale, revision: bundle.revision })
      }
    } catch {
      if (!this.ready) {
        const cached = await this.store.load(this.config.projectId, locale)
        if (cached) {
          this.ready = true
        }
      }
    }
  }

  destroy(): void {
    if (this.visibilityCleanup) {
      this.visibilityCleanup()
      this.visibilityCleanup = null
    }
  }

  private async loadCachedBundle(): Promise<void> {
    const cached = await this.store.load(this.config.projectId, this.currentLocale)
    if (!cached) return

    const bundle = parseBundle(cached.json)
    if (!bundle) {
      await this.store.delete(this.config.projectId, this.currentLocale)
      return
    }

    const error = await verifyBundle(bundle, this.config.publicKeys)
    if (error) {
      this.logger('error', 'Cached bundle verification failed, clearing cache')
      await this.store.delete(this.config.projectId, this.currentLocale)
      return
    }

    this.applyBundle(bundle)
    this.ready = true
    this.cachedETags.set(this.currentLocale, cached.etag ?? '')
  }

  private applyBundle(bundle: StringBundle): void {
    this.currentEntries = Object.freeze({ ...bundle.strings })
    const values: Record<string, string> = {}
    for (const key of Object.keys(bundle.strings)) {
      values[key] = bundle.strings[key]!.value
    }
    this.currentStrings = Object.freeze(values)
    this.currentRevision = bundle.revision
  }

  private clearStrings(): void {
    this.currentStrings = Object.freeze({})
    this.currentEntries = Object.freeze({})
    this.currentRevision = 0
  }

  private observeVisibility(): void {
    if (typeof document === 'undefined') return

    const handler = (): void => {
      if (document.visibilityState === 'visible') {
        this.refresh()
      }
    }

    document.addEventListener('visibilitychange', handler)
    this.visibilityCleanup = () => {
      document.removeEventListener('visibilitychange', handler)
    }
  }
}
