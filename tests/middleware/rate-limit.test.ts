import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser } from "../helpers.js";
import { cache } from "../../src/services/cache.js";

describe("rate limiting", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  it("sets rate limit headers on auth endpoints", async () => {
    const res = await request("POST", "/auth/login", {
      body: { email: "test@test.com" },
    });
    expect(res.headers.get("x-ratelimit-limit")).toBe("10");
    expect(res.headers.get("x-ratelimit-remaining")).toBeTruthy();
  });

  it("returns 429 when rate limit exceeded", async () => {
    const user = await createTestUser({ handle: "alice" });
    // Auth rate limit is 10 per 60s
    // Flush cache to start fresh
    await cache.flushAll();

    for (let i = 0; i < 11; i++) {
      await request("POST", "/auth/login", {
        body: { email: "test@test.com" },
      });
    }

    const res = await request("POST", "/auth/login", {
      body: { email: "test@test.com" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many requests");
  });

  it("rate limits search endpoint", async () => {
    const user = await createTestUser({ handle: "alice" });
    await cache.flushAll();

    // Search rate limit is 30 per 60s
    const res = await request("GET", "/discover/search?q=test", { token: user.accessToken });
    expect(res.headers.get("x-ratelimit-limit")).toBe("30");
  });
});
