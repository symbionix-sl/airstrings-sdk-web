import { describe, it, expect, vi } from 'vitest'
import { Emitter } from '../src/events/emitter'

interface TestEvents {
  'data:updated': { value: number }
  'data:error': { message: string }
}

describe('Emitter', () => {
  it('calls handler on emit', () => {
    const emitter = new Emitter<TestEvents>()
    const handler = vi.fn()

    emitter.on('data:updated', handler)
    emitter.emit('data:updated', { value: 42 })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ value: 42 })
  })

  it('supports multiple handlers for same event', () => {
    const emitter = new Emitter<TestEvents>()
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    emitter.on('data:updated', handler1)
    emitter.on('data:updated', handler2)
    emitter.emit('data:updated', { value: 1 })

    expect(handler1).toHaveBeenCalledOnce()
    expect(handler2).toHaveBeenCalledOnce()
  })

  it('unsubscribes via returned cleanup function', () => {
    const emitter = new Emitter<TestEvents>()
    const handler = vi.fn()

    const cleanup = emitter.on('data:updated', handler)
    emitter.emit('data:updated', { value: 1 })
    expect(handler).toHaveBeenCalledOnce()

    cleanup()
    emitter.emit('data:updated', { value: 2 })
    expect(handler).toHaveBeenCalledOnce() // not called again
  })

  it('unsubscribes via off()', () => {
    const emitter = new Emitter<TestEvents>()
    const handler = vi.fn()

    emitter.on('data:updated', handler)
    emitter.off('data:updated', handler)
    emitter.emit('data:updated', { value: 1 })

    expect(handler).not.toHaveBeenCalled()
  })

  it('isolates different event types', () => {
    const emitter = new Emitter<TestEvents>()
    const updateHandler = vi.fn()
    const errorHandler = vi.fn()

    emitter.on('data:updated', updateHandler)
    emitter.on('data:error', errorHandler)

    emitter.emit('data:updated', { value: 1 })

    expect(updateHandler).toHaveBeenCalledOnce()
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it('does not throw on emit with no listeners', () => {
    const emitter = new Emitter<TestEvents>()
    expect(() => emitter.emit('data:updated', { value: 1 })).not.toThrow()
  })

  it('does not throw on off with no listeners', () => {
    const emitter = new Emitter<TestEvents>()
    const handler = vi.fn()
    expect(() => emitter.off('data:updated', handler)).not.toThrow()
  })
})
