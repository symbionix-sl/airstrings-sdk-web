export type EventHandler<T> = (data: T) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Emitter<TEvents extends Record<string, any>> {
  private listeners = new Map<keyof TEvents, Set<EventHandler<never>>>()

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler as EventHandler<never>)
    return () => {
      set.delete(handler as EventHandler<never>)
      if (set.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(handler as EventHandler<never>)
    if (set.size === 0) {
      this.listeners.delete(event)
    }
  }

  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const handler of set) {
      (handler as EventHandler<TEvents[K]>)(data)
    }
  }
}
