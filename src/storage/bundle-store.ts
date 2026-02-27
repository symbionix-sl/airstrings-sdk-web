import { IdbStore } from './idb-store'
import { MemoryStore } from './memory-store'

export interface StoredBundle {
  readonly json: string
  readonly etag: string | null
}

export interface BundleStore {
  load(projectId: string, locale: string): Promise<StoredBundle | null>
  save(projectId: string, locale: string, bundle: StoredBundle): Promise<void>
  delete(projectId: string, locale: string): Promise<void>
}

export function createBundleStore(custom?: BundleStore): BundleStore {
  if (custom) return custom
  if (typeof indexedDB !== 'undefined') {
    return new IdbStore()
  }
  return new MemoryStore()
}
