/**
 * Cache service — stubs Redis with an in-memory Map.
 *
 * In production, swap this for an Upstash Redis or ioredis client.
 * The interface stays the same.
 */

interface CacheEntry {
  value: string;
  expiresAt: number | null; // epoch ms, null = no expiry
}

const store = new Map<string, CacheEntry>();

function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}

export const cache = {
  async get(key: string): Promise<string | null> {
    const entry = store.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  },

  async del(key: string): Promise<void> {
    store.delete(key);
  },

  async incr(key: string): Promise<number> {
    const entry = store.get(key);
    if (!entry || isExpired(entry)) {
      store.set(key, { value: "1", expiresAt: entry?.expiresAt ?? null });
      return 1;
    }
    const next = parseInt(entry.value, 10) + 1;
    entry.value = String(next);
    return next;
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = store.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  },

  /** Clear all keys — useful for tests */
  async flushAll(): Promise<void> {
    store.clear();
  },
};
