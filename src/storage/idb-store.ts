import { BundleStore, StoredBundle } from './bundle-store'

const DB_NAME = 'airstrings'
const STORE_NAME = 'bundles'
const DB_VERSION = 1

export class IdbStore implements BundleStore {
  private dbPromise: Promise<IDBDatabase> | null = null

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.dbPromise
  }

  private key(projectId: string, locale: string): string {
    return `${projectId}:${locale}`
  }

  async load(projectId: string, locale: string): Promise<StoredBundle | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(this.key(projectId, locale))
      request.onsuccess = () => {
        const result: unknown = request.result
        if (result && typeof result === 'object' && 'json' in result) {
          resolve(result as StoredBundle)
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  async save(projectId: string, locale: string, bundle: StoredBundle): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(bundle, this.key(projectId, locale))
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async delete(projectId: string, locale: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(this.key(projectId, locale))
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}
