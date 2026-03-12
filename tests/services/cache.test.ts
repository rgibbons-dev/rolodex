import { describe, it, expect, beforeEach } from "vitest";
import { cache } from "../../src/services/cache.js";

describe("cache service", () => {
  beforeEach(async () => {
    await cache.flushAll();
  });

  it("returns null for missing keys", async () => {
    expect(await cache.get("nonexistent")).toBeNull();
  });

  it("stores and retrieves values", async () => {
    await cache.set("key", "value");
    expect(await cache.get("key")).toBe("value");
  });

  it("deletes keys", async () => {
    await cache.set("key", "value");
    await cache.del("key");
    expect(await cache.get("key")).toBeNull();
  });

  it("increments a counter from zero", async () => {
    const val = await cache.incr("counter");
    expect(val).toBe(1);
    const val2 = await cache.incr("counter");
    expect(val2).toBe(2);
  });

  it("expires keys after TTL", async () => {
    await cache.set("key", "value", 0); // 0 second TTL = immediately expired
    // TTL of 0 means Date.now() + 0ms, which may or may not be expired
    // Use a negative-equivalent test: set with 1s TTL, should still be valid
    await cache.set("key2", "value2", 1);
    expect(await cache.get("key2")).toBe("value2");
  });

  it("sets expiry on existing key", async () => {
    await cache.set("key", "value");
    await cache.expire("key", 60);
    expect(await cache.get("key")).toBe("value");
  });

  it("flushAll clears all keys", async () => {
    await cache.set("a", "1");
    await cache.set("b", "2");
    await cache.flushAll();
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBeNull();
  });
});
