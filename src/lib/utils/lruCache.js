export class LruCache {
  constructor(maxSize = 100, ttlMs = 300000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
    this.store = new Map()
  }

  get(key) {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() - entry.ts > this.ttlMs) {
      this.store.delete(key)
      return undefined
    }
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key, value) {
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value
      this.store.delete(oldest)
    }
    this.store.set(key, { value, ts: Date.now() })
  }

  has(key) {
    return this.get(key) !== undefined
  }

  delete(key) {
    return this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }

  get size() {
    return this.store.size
  }
}
