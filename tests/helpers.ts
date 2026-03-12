import app from "../src/app.js";
import { authService } from "../src/services/auth.js";
import { db } from "../src/db/index.js";
import { users, contactLinks, friendships, magicLinks, refreshTokens, notifications } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { cache } from "../src/services/cache.js";

export { app };

/**
 * Create a user directly in the DB and return their ID, handle, and tokens.
 */
export async function createTestUser(overrides: {
  handle?: string;
  email?: string;
  displayName?: string;
  isPublic?: boolean;
} = {}) {
  const id = uuid();
  const handle = overrides.handle || `user_${id.slice(0, 8)}`;
  const email = overrides.email || `${handle}@test.com`;
  const displayName = overrides.displayName || handle;

  await db.insert(users).values({
    id,
    handle,
    email,
    displayName,
    isPublic: overrides.isPublic ?? true,
  });

  const tokens = await authService.generateTokens(id, handle);

  return { id, handle, email, displayName, ...tokens };
}

/**
 * Make a JSON request to the app.
 */
export function request(method: string, path: string, options: {
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
} = {}) {
  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const init: RequestInit = { method, headers };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  return app.request(path, init);
}

/**
 * Clean all tables between tests.
 */
export async function cleanDB() {
  await db.delete(notifications);
  await db.delete(refreshTokens);
  await db.delete(magicLinks);
  await db.delete(contactLinks);
  await db.delete(friendships);
  await db.delete(users);
  await cache.flushAll();
}

/**
 * Create a friendship between two users.
 */
export async function makeFriends(userIdA: string, userIdB: string) {
  const [a, b] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
  await db.insert(friendships).values({
    userA: a,
    userB: b,
    status: "accepted",
    initiatedBy: a,
  });
}
