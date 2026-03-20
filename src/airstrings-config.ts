import { BundleStore } from './storage/bundle-store'
import { Logger } from './types'

export interface AirStringsConfig {
  readonly projectId: string
  readonly publicKeys: readonly string[]
  readonly locale: string
  readonly logger?: Logger
  readonly store?: BundleStore
}

export const CDN_BASE_URL = 'https://cdn.airstrings.com'
