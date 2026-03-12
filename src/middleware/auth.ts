import { createMiddleware } from "hono/factory";
import { authService } from "../services/auth.js";
import type { AppEnv } from "../types.js";

/**
 * JWT authentication middleware.
 * Extracts the Bearer token from the Authorization header,
 * verifies it, and sets `userId` and `handle` on the context.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = header.slice(7);
  const payload = authService.verifyToken(token);

  if (!payload || payload.type !== "access") {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("userId", payload.sub);
  c.set("handle", payload.handle);

  await next();
});

/**
 * Optional auth middleware — sets userId if token is present, but doesn't reject.
 * Useful for public endpoints that show more data to authenticated users.
 */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    const payload = authService.verifyToken(token);
    if (payload && payload.type === "access") {
      c.set("userId", payload.sub);
      c.set("handle", payload.handle);
    }
  }

  await next();
});
