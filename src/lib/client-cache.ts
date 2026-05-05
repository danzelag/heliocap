type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const memoryCache = new Map<string, CacheEntry<unknown>>()

export function readClientCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null

  const entry = memoryCache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return null
  }

  return entry.value
}

export function writeClientCache<T>(key: string, value: T, ttlMs = 45_000) {
  if (typeof window === 'undefined') return

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })
}
