import { BundleStore } from './storage/bundle-store'
import { Logger } from './types'

export interface AirStringsConfig {
  readonly projectId: string
  readonly publicKeys: Readonly<Record<string, Uint8Array>>
  readonly locale: string
  readonly baseURL?: string
  readonly logger?: Logger
  readonly store?: BundleStore
}

export const DEFAULT_BASE_URL = 'https://cdn.airstrings.com'
