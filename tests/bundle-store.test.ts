import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from '../src/storage/memory-store'

describe('BundleStore (MemoryStore)', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = new MemoryStore()
  })

  it('save and load round-trip', async () => {
    await store.save('proj_test12345678', 'env_test12345678', 'en', {
      json: '{"format_version":1,"strings":{}}',
      etag: '"rev:42"',
    })

    const loaded = await store.load('proj_test12345678', 'env_test12345678', 'en')
    expect(loaded).not.toBeNull()
    expect(loaded!.json).toBe('{"format_version":1,"strings":{}}')
    expect(loaded!.etag).toBe('"rev:42"')
  })

  it('returns null when empty', async () => {
    const loaded = await store.load('proj_nonexistent', 'env_test12345678', 'en')
    expect(loaded).toBeNull()
  })

  it('isolates per locale', async () => {
    await store.save('proj_test12345678', 'env_test12345678', 'en', {
      json: '{"locale":"en"}',
      etag: '"en:1"',
    })
    await store.save('proj_test12345678', 'env_test12345678', 'fr', {
      json: '{"locale":"fr"}',
      etag: '"fr:1"',
    })

    const enLoaded = await store.load('proj_test12345678', 'env_test12345678', 'en')
    const frLoaded = await store.load('proj_test12345678', 'env_test12345678', 'fr')

    expect(enLoaded!.json).toBe('{"locale":"en"}')
    expect(frLoaded!.json).toBe('{"locale":"fr"}')
    expect(enLoaded!.etag).toBe('"en:1"')
    expect(frLoaded!.etag).toBe('"fr:1"')
  })

  it('delete removes cache', async () => {
    await store.save('proj_test12345678', 'env_test12345678', 'en', {
      json: '{"test":true}',
      etag: null,
    })
    expect(await store.load('proj_test12345678', 'env_test12345678', 'en')).not.toBeNull()

    await store.delete('proj_test12345678', 'env_test12345678', 'en')
    expect(await store.load('proj_test12345678', 'env_test12345678', 'en')).toBeNull()
  })

  it('stores with null etag', async () => {
    await store.save('proj_test12345678', 'env_test12345678', 'en', {
      json: '{"test":true}',
      etag: null,
    })

    const loaded = await store.load('proj_test12345678', 'env_test12345678', 'en')
    expect(loaded).not.toBeNull()
    expect(loaded!.json).toBe('{"test":true}')
    expect(loaded!.etag).toBeNull()
  })

  it('overwrites existing cache', async () => {
    await store.save('proj_test12345678', 'env_test12345678', 'en', {
      json: '{"revision":1}',
      etag: '"v1"',
    })
    await store.save('proj_test12345678', 'env_test12345678', 'en', {
      json: '{"revision":2}',
      etag: '"v2"',
    })

    const loaded = await store.load('proj_test12345678', 'env_test12345678', 'en')
    expect(loaded!.json).toBe('{"revision":2}')
    expect(loaded!.etag).toBe('"v2"')
  })

  it('isolates per project', async () => {
    await store.save('proj_aaa', 'env_test12345678', 'en', {
      json: '{"project":"aaa"}',
      etag: null,
    })
    await store.save('proj_bbb', 'env_test12345678', 'en', {
      json: '{"project":"bbb"}',
      etag: null,
    })

    const aaa = await store.load('proj_aaa', 'env_test12345678', 'en')
    const bbb = await store.load('proj_bbb', 'env_test12345678', 'en')

    expect(aaa!.json).toBe('{"project":"aaa"}')
    expect(bbb!.json).toBe('{"project":"bbb"}')
  })
})
