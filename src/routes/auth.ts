import { Hono } from "hono";
import { authService } from "../services/auth.js";
import type { AppEnv } from "../types.js";

const auth = new Hono<AppEnv>();

/**
 * POST /auth/register
 * Body: { handle, email, displayName }
 */
auth.post("/register", async (c) => {
  const body = await c.req.json<{
    handle: string;
    email: string;
    displayName: string;
  }>();

  if (!body.handle || !body.email || !body.displayName) {
    return c.json({ error: "handle, email, and displayName are required" }, 400);
  }

  // Basic handle validation
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(body.handle)) {
    return c.json(
      { error: "Handle must be 3-30 characters, alphanumeric and underscores only" },
      400
    );
  }

  const result = await authService.register({
    handle: body.handle,
    email: body.email,
    displayName: body.displayName,
  });

  if ("error" in result) {
    return c.json({ error: result.error }, 409);
  }

  // Generate tokens immediately after registration
  const tokens = authService.generateTokens(result.userId, body.handle);
  return c.json({ userId: result.userId, ...tokens }, 201);
});

/**
 * POST /auth/login
 * Body: { email }
 * Sends a magic link to the email address.
 */
auth.post("/login", async (c) => {
  const body = await c.req.json<{ email: string }>();

  if (!body.email) {
    return c.json({ error: "email is required" }, 400);
  }

  await authService.createMagicLink(body.email);

  return c.json({ message: "Magic link sent. Check your email." });
});

/**
 * POST /auth/magic-link
 * Body: { email }
 * Same as login — sends a magic link (for passwordless signup/login).
 */
auth.post("/magic-link", async (c) => {
  const body = await c.req.json<{ email: string }>();

  if (!body.email) {
    return c.json({ error: "email is required" }, 400);
  }

  await authService.createMagicLink(body.email);

  return c.json({ message: "Magic link sent. Check your email." });
});

/**
 * GET /auth/magic-link/verify?token=...
 * Verifies a magic link token and returns JWT tokens.
 */
auth.get("/magic-link/verify", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "token query parameter is required" }, 400);
  }

  const result = await authService.verifyMagicLink(token);
  if (!result) {
    return c.json({ error: "Invalid or expired magic link" }, 401);
  }

  const tokens = authService.generateTokens(result.userId, result.handle);
  return c.json({ userId: result.userId, ...tokens });
});

/**
 * POST /auth/refresh
 * Body: { refreshToken }
 * Returns a new token pair.
 */
auth.post("/refresh", async (c) => {
  const body = await c.req.json<{ refreshToken: string }>();

  if (!body.refreshToken) {
    return c.json({ error: "refreshToken is required" }, 400);
  }

  const tokens = await authService.refreshTokens(body.refreshToken);
  if (!tokens) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }

  return c.json(tokens);
});

export default auth;
