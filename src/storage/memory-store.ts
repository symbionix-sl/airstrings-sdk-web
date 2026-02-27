import { BundleStore, StoredBundle } from './bundle-store'

export class MemoryStore implements BundleStore {
  private data = new Map<string, StoredBundle>()

  private key(projectId: string, locale: string): string {
    return `${projectId}:${locale}`
  }

  async load(projectId: string, locale: string): Promise<StoredBundle | null> {
    return this.data.get(this.key(projectId, locale)) ?? null
  }

  async save(projectId: string, locale: string, bundle: StoredBundle): Promise<void> {
    this.data.set(this.key(projectId, locale), bundle)
  }

  async delete(projectId: string, locale: string): Promise<void> {
    this.data.delete(this.key(projectId, locale))
  }
}
