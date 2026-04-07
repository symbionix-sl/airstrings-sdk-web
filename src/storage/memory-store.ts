import { BundleStore, StoredBundle } from './bundle-store'

export class MemoryStore implements BundleStore {
  private data = new Map<string, StoredBundle>()

  private key(projectId: string, environmentId: string, locale: string): string {
    return `${projectId}:${environmentId}:${locale}`
  }

  async load(projectId: string, environmentId: string, locale: string): Promise<StoredBundle | null> {
    return this.data.get(this.key(projectId, environmentId, locale)) ?? null
  }

  async save(projectId: string, environmentId: string, locale: string, bundle: StoredBundle): Promise<void> {
    this.data.set(this.key(projectId, environmentId, locale), bundle)
  }

  async delete(projectId: string, environmentId: string, locale: string): Promise<void> {
    this.data.delete(this.key(projectId, environmentId, locale))
  }
}
