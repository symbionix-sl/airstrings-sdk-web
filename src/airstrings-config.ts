import { BundleStore } from './storage/bundle-store'
import { Logger } from './types'

export interface AirStringsConfig {
  readonly organizationId: string
  readonly projectId: string
  readonly environmentId: string
  readonly publicKeys: readonly string[]
  readonly locale: string
  readonly apiBaseURL?: string
  readonly logger?: Logger
  readonly store?: BundleStore
}
