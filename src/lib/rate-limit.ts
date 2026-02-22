import { cache } from "../services/cache.js";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.js";

/**
 * Rate limiting middleware — backed by the cache service (Redis stub).
 *
 * Uses a sliding window counter approach.
 * In production, swap the cache service for Upstash Redis.
 */
export function rateLimit(opts: {
  /** Unique prefix for this limiter (e.g., "search", "friend_request") */
  prefix: string;
  /** Maximum requests allowed in the window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    // Use IP + userId (if authed) as the key
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const userId = c.get("userId");
    const identifier = userId || ip;
    const key = `rl:${opts.prefix}:${identifier}`;

    const count = await cache.incr(key);
    if (count === 1) {
      // First request — set expiry
      await cache.expire(key, opts.windowSeconds);
    }

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(opts.max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.max - count)));

    if (count > opts.max) {
      return c.json(
        { error: "Too many requests. Please try again later." },
        429
      );
    }

    await next();
  });
}
