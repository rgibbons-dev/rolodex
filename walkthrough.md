# Rolodex — Code Walkthrough

*2026-02-25T02:31:55Z by Showboat 0.6.1*
<!-- showboat-id: 031bc161-23ce-4d68-86ef-3c5069fc63a6 -->

This walkthrough explains the Rolodex backend from the ground up — starting at the entry point, tracing through each layer, and ending at the HTTP surface. Rolodex is a social contact-sharing network: users create profile cards with their contact methods, connect with friends, and discover people through the social graph.

The stack is **Hono** (HTTP framework), **Drizzle ORM** over **SQLite** (stubbing PostgreSQL), with **JWT** auth, and in-memory stubs for Redis, R2 object storage, and email. The codebase implements all four build phases from `arch.md`: core loop, social graph, discovery, and polish/export.

## 1. Entry Point

The server starts in `src/index.ts`. It does three things: runs database migrations, imports the Hono app, and starts listening.

```bash
cat -n src/index.ts
```

```output
     1	import { serve } from "@hono/node-server";
     2	import app from "./app.js";
     3	
     4	// Run migrations on startup
     5	import "./db/migrate-runtime.js";
     6	
     7	const port = parseInt(process.env.PORT || "3000", 10);
     8	
     9	console.log(`Rolodex API starting on http://localhost:${port}`);
    10	
    11	serve({
    12	  fetch: app.fetch,
    13	  port,
    14	});
```

Line 5 is the key side-effect import — it triggers `migrate-runtime.ts`, which creates all SQLite tables before any request is served. The `serve()` call on line 11 bridges Hono's web-standard `fetch` interface to Node's HTTP server.

## 2. Database Schema

The data model lives in `src/db/schema.ts`. This is the single source of truth for the application's structure. Five tables model the entire domain:

```bash
sed -n "1,8p" src/db/schema.ts
```

```output
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Enums as string unions (SQLite doesn't have native enums) ---

export type ContactLinkType =
  | "phone"
  | "whatsapp"
```

Since SQLite has no native enum types, the schema defines TypeScript union types that Drizzle enforces at the application layer. The contact link types map directly to the messaging platforms from the product spec.

### Users table

The core identity table — every person in the system gets one row:

```bash
sed -n '/^export const users/,/^);/p' src/db/schema.ts
```

```output
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(), // UUID
    handle: text("handle").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio").default(""),
    avatarUrl: text("avatar_url"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    // Settings (Phase 4)
    notifyFriendRequests: integer("notify_friend_requests", { mode: "boolean" })
      .notNull()
      .default(true),
    notifyFriendAccepted: integer("notify_friend_accepted", { mode: "boolean" })
      .notNull()
      .default(true),
  },
  (table) => [
    uniqueIndex("users_handle_idx").on(table.handle),
    uniqueIndex("users_email_idx").on(table.email),
  ]
);
```

Notable design choices: `isPublic` controls whether your friend list is visible to non-friends. The notification preference booleans (`notifyFriendRequests`, `notifyFriendAccepted`) were added in Phase 4 but live on the user row to avoid a separate settings table. Unique indexes on `handle` and `email` enforce identity constraints at the database level.

### ContactLinks table

This is the heart of the product — each row is one way to reach someone:

```bash
sed -n '/^export const contactLinks/,/^);/p' src/db/schema.ts
```

```output
export const contactLinks = sqliteTable(
  "contact_links",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<ContactLinkType>(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    visibility: text("visibility").notNull().$type<ContactLinkVisibility>().default("friends_only"),
  },
  (table) => [index("contact_links_user_idx").on(table.userId)]
);
```

The `visibility` field defaults to `friends_only` — privacy by default, as the architecture document specifies. Each link has a `sortOrder` so users control how their card appears. The `.$type<>()` calls let Drizzle know the column holds one of our union types, even though SQLite stores it as plain text.

### Friendships table

The social graph is stored as a single row per pair of users:

```bash
sed -n '/^export const friendships/,/^);/p' src/db/schema.ts
```

```output
export const friendships = sqliteTable(
  "friendships",
  {
    // Canonical ordering: userA < userB
    userA: text("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().$type<FriendshipStatus>().default("pending"),
    // Who initiated the request (needed to know who should accept)
    initiatedBy: text("initiated_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("friendships_pair_idx").on(table.userA, table.userB),
    index("friendships_user_a_idx").on(table.userA),
    index("friendships_user_b_idx").on(table.userB),
  ]
);
```

The **canonical ordering** constraint (`userA < userB`) is critical — it means the friendship between Alice and Bob is always stored as `(Alice, Bob)` regardless of who sent the request. This eliminates duplicate rows without needing to check both directions. The `initiatedBy` field tracks who sent the request so the system knows who is allowed to accept it. The composite unique index on `(user_a, user_b)` enforces one-row-per-pair at the database level.

### Magic Links and Notifications

Two supporting tables round out the schema:

```bash
sed -n '/^export const magicLinks/,/^});/p' src/db/schema.ts
```

```output
export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey(), // UUID
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

```bash
sed -n '/^export const notifications/,/^);/p' src/db/schema.ts
```

```output
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "friend_request" | "friend_accepted"
    fromUserId: text("from_user_id").references(() => users.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
  ]
);
```

Magic links are one-time-use tokens with an expiry. The `used` flag prevents replay. Notifications use `ON DELETE SET NULL` for the sender reference — if a user deletes their account, existing notifications about them remain readable but lose the sender link.

## 3. Database Connection

The Drizzle ORM connection is initialized in `src/db/index.ts`:

```bash
cat -n src/db/index.ts
```

```output
     1	import Database from "better-sqlite3";
     2	import { drizzle } from "drizzle-orm/better-sqlite3";
     3	import * as schema from "./schema.js";
     4	import { existsSync, mkdirSync } from "fs";
     5	import { dirname } from "path";
     6	
     7	const DB_PATH = process.env.DATABASE_URL || "./data/rolodex.db";
     8	
     9	// Ensure directory exists
    10	const dir = dirname(DB_PATH);
    11	if (!existsSync(dir)) {
    12	  mkdirSync(dir, { recursive: true });
    13	}
    14	
    15	const sqlite = new Database(DB_PATH);
    16	
    17	// Enable WAL mode for better concurrent read performance
    18	sqlite.pragma("journal_mode = WAL");
    19	sqlite.pragma("foreign_keys = ON");
    20	
    21	export const db = drizzle(sqlite, { schema });
    22	export type DB = typeof db;
```

WAL (Write-Ahead Logging) mode on line 18 allows concurrent readers while a write is in progress — important for an API server handling multiple requests. `foreign_keys = ON` is required in SQLite (it's off by default) to enforce the `REFERENCES` constraints in the schema. The `{ schema }` argument to `drizzle()` enables relational query mode.

## 4. Stub Services

Three external dependencies are stubbed for local development. Each stub implements the same interface the production version would use.

### Cache (Redis stub)

The cache service provides a `Map`-based replacement for Redis:

```bash
cat -n src/services/cache.ts
```

```output
     1	/**
     2	 * Cache service — stubs Redis with an in-memory Map.
     3	 *
     4	 * In production, swap this for an Upstash Redis or ioredis client.
     5	 * The interface stays the same.
     6	 */
     7	
     8	interface CacheEntry {
     9	  value: string;
    10	  expiresAt: number | null; // epoch ms, null = no expiry
    11	}
    12	
    13	const store = new Map<string, CacheEntry>();
    14	
    15	function isExpired(entry: CacheEntry): boolean {
    16	  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
    17	}
    18	
    19	export const cache = {
    20	  async get(key: string): Promise<string | null> {
    21	    const entry = store.get(key);
    22	    if (!entry) return null;
    23	    if (isExpired(entry)) {
    24	      store.delete(key);
    25	      return null;
    26	    }
    27	    return entry.value;
    28	  },
    29	
    30	  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    31	    store.set(key, {
    32	      value,
    33	      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    34	    });
    35	  },
    36	
    37	  async del(key: string): Promise<void> {
    38	    store.delete(key);
    39	  },
    40	
    41	  async incr(key: string): Promise<number> {
    42	    const entry = store.get(key);
    43	    if (!entry || isExpired(entry)) {
    44	      store.set(key, { value: "1", expiresAt: entry?.expiresAt ?? null });
    45	      return 1;
    46	    }
    47	    const next = parseInt(entry.value, 10) + 1;
    48	    entry.value = String(next);
    49	    return next;
    50	  },
    51	
    52	  async expire(key: string, ttlSeconds: number): Promise<void> {
    53	    const entry = store.get(key);
    54	    if (entry) {
    55	      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    56	    }
    57	  },
    58	
    59	  /** Clear all keys — useful for tests */
    60	  async flushAll(): Promise<void> {
    61	    store.clear();
    62	  },
    63	};
```

All methods are async to match the Redis client interface — the in-memory implementation is synchronous but wrapping it in promises means no call-site changes when swapping to real Redis. The `incr` method (line 41) mirrors Redis's `INCR` command and is used by the rate limiter. Lazy expiration (check on read, line 23) avoids needing a background cleanup timer.

### Storage (R2/S3 stub)

Avatar uploads go through a local filesystem adapter:

```bash
cat -n src/services/storage.ts
```

```output
     1	/**
     2	 * File storage service — stubs Cloudflare R2 / S3 with local filesystem.
     3	 *
     4	 * In production, swap this for the R2 or S3 SDK.
     5	 */
     6	
     7	import { writeFile, unlink, mkdir } from "fs/promises";
     8	import { existsSync } from "fs";
     9	import { join, dirname } from "path";
    10	
    11	const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
    12	
    13	async function ensureDir(dir: string) {
    14	  if (!existsSync(dir)) {
    15	    await mkdir(dir, { recursive: true });
    16	  }
    17	}
    18	
    19	export const storage = {
    20	  /**
    21	   * Upload a file and return a public URL path.
    22	   * In production this would upload to R2 and return a CDN URL.
    23	   */
    24	  async upload(key: string, data: Buffer, _contentType?: string): Promise<string> {
    25	    const filePath = join(UPLOAD_DIR, key);
    26	    await ensureDir(dirname(filePath));
    27	    await writeFile(filePath, data);
    28	    // Return a URL path that the API can serve
    29	    return `/uploads/${key}`;
    30	  },
    31	
    32	  /**
    33	   * Delete a file by key.
    34	   */
    35	  async remove(key: string): Promise<void> {
    36	    const filePath = join(UPLOAD_DIR, key);
    37	    try {
    38	      await unlink(filePath);
    39	    } catch {
    40	      // File may not exist — ignore
    41	    }
    42	  },
    43	
    44	  /**
    45	   * Get the local file path for serving. In production, this would be a CDN URL.
    46	   */
    47	  getLocalPath(key: string): string {
    48	    return join(UPLOAD_DIR, key);
    49	  },
    50	};
```

The upload method returns a path like `/uploads/avatars/uuid.jpg` — which the app serves via Hono's `serveStatic` middleware (configured in `app.ts`). In production, this would return a CDN URL instead.

### Email (stub)

The email service logs to console rather than sending real mail:

```bash
cat -n src/services/email.ts
```

```output
     1	/**
     2	 * Email service — stubs email sending with console output.
     3	 *
     4	 * In production, swap this for SendGrid, Resend, Postmark, or SES.
     5	 */
     6	
     7	export interface EmailOptions {
     8	  to: string;
     9	  subject: string;
    10	  text: string;
    11	  html?: string;
    12	}
    13	
    14	export const email = {
    15	  async send(options: EmailOptions): Promise<void> {
    16	    // Stub: log to console instead of sending
    17	    console.log("──────────────────────────────────────");
    18	    console.log("📧 EMAIL STUB (would send in production)");
    19	    console.log(`   To:      ${options.to}`);
    20	    console.log(`   Subject: ${options.subject}`);
    21	    console.log(`   Body:    ${options.text}`);
    22	    console.log("──────────────────────────────────────");
    23	  },
    24	};
```

## 5. Authentication System

Auth is split across a service (`src/services/auth.ts`) and middleware (`src/middleware/auth.ts`). The service handles token mechanics and user creation; the middleware enforces auth on routes.

### Auth service — Token generation and magic links

```bash
sed -n '1,38p' src/services/auth.ts
```

```output
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users, magicLinks } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { email } from "./email.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";
const MAGIC_LINK_TTL_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string; // user ID
  handle: string;
  type: "access" | "refresh";
}

function signToken(payload: Omit<JwtPayload, "type">, type: "access" | "refresh"): string {
  return jwt.sign(
    { ...payload, type },
    JWT_SECRET,
    { expiresIn: type === "access" ? JWT_EXPIRES_IN : REFRESH_EXPIRES_IN }
  );
}

export const authService = {
  generateTokens(userId: string, handle: string): TokenPair {
    return {
      accessToken: signToken({ sub: userId, handle }, "access"),
      refreshToken: signToken({ sub: userId, handle }, "refresh"),
    };
  },
```

The token system uses short-lived access tokens (15 minutes) paired with long-lived refresh tokens (7 days). Both carry the same payload — user ID and handle — but are distinguished by the `type` field to prevent a refresh token from being used as an access token.

The `signToken` helper (line 24) is a private function that both `generateTokens` and `refreshTokens` delegate to.

### Magic link flow

The magic link flow is the primary auth mechanism — no passwords:

```bash
sed -n '/async createMagicLink/,/^  },/p' src/services/auth.ts
```

```output
  async createMagicLink(emailAddress: string): Promise<string> {
    const token = uuid();
    const expiresAt = new Date(
      Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000
    ).toISOString();

    await db.insert(magicLinks).values({
      id: uuid(),
      email: emailAddress,
      token,
      expiresAt,
    });

    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    const link = `${baseUrl}/auth/magic-link/verify?token=${token}`;

    await email.send({
      to: emailAddress,
      subject: "Your Rolodex login link",
      text: `Click here to log in: ${link}\n\nThis link expires in ${MAGIC_LINK_TTL_MINUTES} minutes.`,
    });

    return token;
  },
```

```bash
sed -n '/async verifyMagicLink/,/^  },/p' src/services/auth.ts
```

```output
  async verifyMagicLink(token: string): Promise<{ userId: string; handle: string } | null> {
    const rows = await db
      .select()
      .from(magicLinks)
      .where(eq(magicLinks.token, token))
      .limit(1);

    if (rows.length === 0) return null;
    const link = rows[0];

    if (link.used) return null;
    if (new Date(link.expiresAt) < new Date()) return null;

    // Mark as used
    await db
      .update(magicLinks)
      .set({ used: true })
      .where(eq(magicLinks.id, link.id));

    // Find or create user
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, link.email))
      .limit(1);

    if (user.length === 0) {
      // Auto-create user with email-based handle
      const handle = link.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
      const id = uuid();
      await db.insert(users).values({
        id,
        handle,
        email: link.email,
        displayName: handle,
      });
      return { userId: id, handle };
    }

    return { userId: user[0].id, handle: user[0].handle };
  },
```

The flow: `createMagicLink` generates a UUID token, stores it in the database with a 15-minute TTL, and sends an email with the verification URL. When the user clicks the link, `verifyMagicLink` checks the token is valid, unused, and unexpired — then marks it used. If no user exists for that email, one is auto-created with a handle derived from the email prefix. This means magic links double as a signup mechanism.

### Auth middleware

The middleware reads JWT tokens from the `Authorization: Bearer <token>` header:

```bash
cat -n src/middleware/auth.ts
```

```output
     1	import { createMiddleware } from "hono/factory";
     2	import { authService } from "../services/auth.js";
     3	import type { AppEnv } from "../types.js";
     4	
     5	/**
     6	 * JWT authentication middleware.
     7	 * Extracts the Bearer token from the Authorization header,
     8	 * verifies it, and sets `userId` and `handle` on the context.
     9	 */
    10	export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
    11	  const header = c.req.header("Authorization");
    12	  if (!header?.startsWith("Bearer ")) {
    13	    return c.json({ error: "Missing or invalid Authorization header" }, 401);
    14	  }
    15	
    16	  const token = header.slice(7);
    17	  const payload = authService.verifyToken(token);
    18	
    19	  if (!payload || payload.type !== "access") {
    20	    return c.json({ error: "Invalid or expired token" }, 401);
    21	  }
    22	
    23	  c.set("userId", payload.sub);
    24	  c.set("handle", payload.handle);
    25	
    26	  await next();
    27	});
    28	
    29	/**
    30	 * Optional auth middleware — sets userId if token is present, but doesn't reject.
    31	 * Useful for public endpoints that show more data to authenticated users.
    32	 */
    33	export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
    34	  const header = c.req.header("Authorization");
    35	  if (header?.startsWith("Bearer ")) {
    36	    const token = header.slice(7);
    37	    const payload = authService.verifyToken(token);
    38	    if (payload && payload.type === "access") {
    39	      c.set("userId", payload.sub);
    40	      c.set("handle", payload.handle);
    41	    }
    42	  }
    43	
    44	  await next();
    45	});
```

Two variants: `requireAuth` rejects requests without a valid token (401). `optionalAuth` sets the user identity if a token is present but allows unauthenticated access — used on public profile pages where authenticated users see more contact info than anonymous visitors. Both use Hono's `createMiddleware<AppEnv>()` factory to get type-safe access to the `userId` and `handle` context variables.

## 6. Hono Type System

A small but important file makes the Hono context type-safe across the whole app:

```bash
cat -n src/types.ts
```

```output
     1	import type { Env } from "hono";
     2	
     3	/**
     4	 * Hono environment type with custom context variables.
     5	 */
     6	export interface AppEnv extends Env {
     7	  Variables: {
     8	    userId: string;
     9	    handle: string;
    10	  };
    11	}
```

Every `new Hono<AppEnv>()` and `createMiddleware<AppEnv>()` references this type. Without it, `c.get("userId")` returns `never` and TypeScript rejects the code. This is Hono's way of making context variables type-safe — you declare what's available, and the compiler enforces it everywhere.

## 7. The Application Shell

`src/app.ts` wires everything together — middleware, rate limiting, static files, and routes:

```bash
cat -n src/app.ts
```

```output
     1	import { Hono } from "hono";
     2	import { cors } from "hono/cors";
     3	import { logger } from "hono/logger";
     4	import { serveStatic } from "@hono/node-server/serve-static";
     5	
     6	import authRoutes from "./routes/auth.js";
     7	import profileRoutes from "./routes/profile.js";
     8	import friendRoutes from "./routes/friends.js";
     9	import discoveryRoutes from "./routes/discovery.js";
    10	import exportRoutes from "./routes/export.js";
    11	import settingsRoutes from "./routes/settings.js";
    12	import qrRoutes from "./routes/qr.js";
    13	
    14	import { rateLimit } from "./lib/rate-limit.js";
    15	
    16	import type { AppEnv } from "./types.js";
    17	
    18	const app = new Hono<AppEnv>();
    19	
    20	// --- Global middleware ---
    21	app.use("*", logger());
    22	app.use("*", cors());
    23	
    24	// --- Rate limiting on sensitive endpoints ---
    25	app.use("/discover/search", rateLimit({ prefix: "search", max: 30, windowSeconds: 60 }));
    26	app.use("/friends/request/*", rateLimit({ prefix: "friend_req", max: 20, windowSeconds: 60 }));
    27	app.use("/auth/*", rateLimit({ prefix: "auth", max: 10, windowSeconds: 60 }));
    28	
    29	// --- Serve uploaded files (avatar stubs) ---
    30	app.use("/uploads/*", serveStatic({ root: "./" }));
    31	
    32	// --- Routes ---
    33	app.route("/auth", authRoutes);
    34	app.route("/", profileRoutes);
    35	app.route("/", friendRoutes);
    36	app.route("/", discoveryRoutes);
    37	app.route("/", exportRoutes);
    38	app.route("/", settingsRoutes);
    39	app.route("/", qrRoutes);
    40	
    41	// --- Health check ---
    42	app.get("/health", (c) => c.json({ status: "ok" }));
    43	
    44	// --- 404 fallback ---
    45	app.notFound((c) => c.json({ error: "Not found" }, 404));
    46	
    47	// --- Error handler ---
    48	app.onError((err, c) => {
    49	  console.error("Unhandled error:", err);
    50	  return c.json({ error: "Internal server error" }, 500);
    51	});
    52	
    53	export default app;
```

The middleware execution order matters. Every request hits `logger()` and `cors()` first (lines 21-22). Then rate limiting is applied selectively — search gets 30 req/min, friend requests 20 req/min, and auth endpoints 10 req/min (lines 25-27). The auth route gets its own prefix via `app.route("/auth", authRoutes)` on line 33, while all other routes mount at root and define their full paths internally.

Line 30 serves the `./uploads/` directory as static files — this is how avatar images uploaded through the storage stub are served back to clients.

## 8. Rate Limiting

The rate limiter is a middleware factory built on top of the cache service:

```bash
cat -n src/lib/rate-limit.ts
```

```output
     1	import { cache } from "../services/cache.js";
     2	import { createMiddleware } from "hono/factory";
     3	import type { AppEnv } from "../types.js";
     4	
     5	/**
     6	 * Rate limiting middleware — backed by the cache service (Redis stub).
     7	 *
     8	 * Uses a sliding window counter approach.
     9	 * In production, swap the cache service for Upstash Redis.
    10	 */
    11	export function rateLimit(opts: {
    12	  /** Unique prefix for this limiter (e.g., "search", "friend_request") */
    13	  prefix: string;
    14	  /** Maximum requests allowed in the window */
    15	  max: number;
    16	  /** Window duration in seconds */
    17	  windowSeconds: number;
    18	}) {
    19	  return createMiddleware<AppEnv>(async (c, next) => {
    20	    // Use IP + userId (if authed) as the key
    21	    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    22	    const userId = c.get("userId");
    23	    const identifier = userId || ip;
    24	    const key = `rl:${opts.prefix}:${identifier}`;
    25	
    26	    const count = await cache.incr(key);
    27	    if (count === 1) {
    28	      // First request — set expiry
    29	      await cache.expire(key, opts.windowSeconds);
    30	    }
    31	
    32	    // Set rate limit headers
    33	    c.header("X-RateLimit-Limit", String(opts.max));
    34	    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.max - count)));
    35	
    36	    if (count > opts.max) {
    37	      return c.json(
    38	        { error: "Too many requests. Please try again later." },
    39	        429
    40	      );
    41	    }
    42	
    43	    await next();
    44	  });
    45	}
```

The pattern is Redis-standard: `INCR` a key, set its TTL on first hit, reject when the count exceeds the limit. The key format `rl:{prefix}:{identifier}` namespaces counters — so the search and friend-request limiters are independent. The identifier prefers the authenticated user ID over IP, which means rate limits follow the user across devices but also work for unauthenticated endpoints.

Standard `X-RateLimit-*` headers (lines 33-34) let clients know how many requests they have left.

## 9. Routes — Phase 1: Core Loop

### Auth routes

The auth routes handle registration, login, and token refresh:

```bash
sed -n '/POST \/auth\/register/,/^});/p' src/routes/auth.ts
```

```output
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
```

Registration validates the handle format (alphanumeric + underscores, 3-30 chars), delegates to the auth service for uniqueness checks (handle and email), and returns a token pair immediately — no email verification step needed since magic links handle verification separately. The 409 status code for conflicts (duplicate handle/email) follows REST conventions.

### Profile routes

Profile CRUD is where the product's core value lives — managing your contact card:

```bash
sed -n '/GET \/users\/:handle/,/^});/p' src/routes/profile.ts | head -50
```

```output
 * GET /users/:handle — Public profile (respects visibility).
 * If authenticated, contact links are filtered based on relationship.
 */
profile.get("/users/:handle", optionalAuth, async (c) => {
  const handle = c.req.param("handle");
  const viewerId: string | undefined = c.get("userId");

  const user = await db
    .select()
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const u = user[0];

  // Get contact links
  const links = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.userId, u.id))
    .orderBy(contactLinks.sortOrder);

  // Filter based on visibility
  const visibleLinks = await filterContactLinks(links, u.id, viewerId ?? null);

  // Get mutual friend count if viewer is authenticated
  let mutualCount = 0;
  let relationship: string = "none";
  if (viewerId && viewerId !== u.id) {
    const mutuals = await friendService.getMutualFriends(u.id, viewerId);
    mutualCount = mutuals.length;
    relationship = await friendService.getRelationship(u.id, viewerId);
  }

  return c.json({
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    isPublic: u.isPublic,
    createdAt: u.createdAt,
    contactLinks: visibleLinks.map((l) => ({
      id: l.id,
      type: l.type,
      label: l.label,
```

This is the most interesting route in the system. It uses `optionalAuth` so both anonymous and authenticated users can view profiles — but they see different things. The key line is the `filterContactLinks` call, which applies the visibility rules. An anonymous viewer only sees links marked `everyone`. A friend sees `everyone` + `friends_only`. A friend-of-friend sees `everyone` + `friends_of_friends`. The response also includes `mutualFriendCount` and `relationship` for authenticated viewers.

### Visibility service

The filtering logic lives in `src/services/visibility.ts`:

```bash
cat -n src/services/visibility.ts
```

```output
     1	import type { ContactLinkVisibility } from "../db/schema.js";
     2	import { friendService } from "./friends.js";
     3	
     4	/**
     5	 * Determines whether a viewer can see a contact link based on its visibility setting,
     6	 * the relationship between the viewer and the owner, and the friend graph.
     7	 */
     8	export async function canViewContactLink(
     9	  visibility: ContactLinkVisibility,
    10	  ownerId: string,
    11	  viewerId: string | null
    12	): Promise<boolean> {
    13	  // Owner can always see their own links
    14	  if (viewerId === ownerId) return true;
    15	
    16	  if (visibility === "everyone") return true;
    17	
    18	  if (!viewerId) return false;
    19	
    20	  if (visibility === "friends_only") {
    21	    const relationship = await friendService.getRelationship(ownerId, viewerId);
    22	    return relationship === "accepted";
    23	  }
    24	
    25	  if (visibility === "friends_of_friends") {
    26	    // Direct friends can see
    27	    const relationship = await friendService.getRelationship(ownerId, viewerId);
    28	    if (relationship === "accepted") return true;
    29	
    30	    // Check if they share any mutual friends
    31	    const mutuals = await friendService.getMutualFriends(ownerId, viewerId);
    32	    return mutuals.length > 0;
    33	  }
    34	
    35	  return false;
    36	}
    37	
    38	/**
    39	 * Filter an array of contact links based on the viewer's access level.
    40	 */
    41	export async function filterContactLinks<
    42	  T extends { visibility: ContactLinkVisibility }
    43	>(links: T[], ownerId: string, viewerId: string | null): Promise<T[]> {
    44	  const results: T[] = [];
    45	  for (const link of links) {
    46	    if (await canViewContactLink(link.visibility, ownerId, viewerId)) {
    47	      results.push(link);
    48	    }
    49	  }
    50	  return results;
    51	}
```

The visibility check is a cascade of permissions. It short-circuits early: owners always pass (line 14), `everyone` always passes (line 16), unauthenticated viewers are rejected for anything non-public (line 18). For `friends_of_friends`, direct friends pass first (line 28), then mutual friends are checked — this means the link is visible to anyone one hop away in the graph.

The generic `filterContactLinks<T>` function (line 41) preserves whatever extra fields the contact link objects carry, filtering by visibility alone.

### Contact link management

The `PUT /users/me/contacts` route does a bulk replace of all contact links:

```bash
sed -n '/PUT \/users\/me\/contacts/,/^});/p' src/routes/profile.ts
```

```output
 * PUT /users/me/contacts — Bulk upsert contact links.
 * Replaces all contact links for the user.
 * Body: { contacts: [{ type, label, value, sortOrder, visibility }] }
 */
profile.put("/users/me/contacts", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const body = await c.req.json<{
    contacts: Array<{
      type: string;
      label: string;
      value: string;
      sortOrder?: number;
      visibility?: string;
    }>;
  }>();

  if (!Array.isArray(body.contacts)) {
    return c.json({ error: "contacts must be an array" }, 400);
  }

  // Delete existing links and insert new ones
  await db.delete(contactLinks).where(eq(contactLinks.userId, userId));

  const newLinks = body.contacts.map((contact, i) => ({
    id: uuid(),
    userId,
    type: contact.type as any,
    label: contact.label,
    value: contact.value,
    sortOrder: contact.sortOrder ?? i,
    visibility: (contact.visibility as any) ?? "friends_only",
  }));

  if (newLinks.length > 0) {
    await db.insert(contactLinks).values(newLinks);
  }

  return c.json({ contacts: newLinks });
});
```

This is a "delete all, re-insert" pattern rather than a merge/diff — simpler to implement and works well when the client sends the complete card state. The `sortOrder` defaults to the array index if not provided, and visibility defaults to `friends_only`.

### QR Code Generation

QR codes are generated in `src/lib/qr.ts` and served via `src/routes/qr.ts`:

```bash
cat -n src/lib/qr.ts
```

```output
     1	import QRCode from "qrcode";
     2	
     3	const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
     4	
     5	/**
     6	 * Generate a QR code PNG buffer for a user's profile URL.
     7	 */
     8	export async function generateProfileQR(handle: string): Promise<Buffer> {
     9	  const url = `${BASE_URL}/@${handle}`;
    10	  return QRCode.toBuffer(url, {
    11	    type: "png",
    12	    width: 512,
    13	    margin: 2,
    14	    color: {
    15	      dark: "#1c1917", // stone-900
    16	      light: "#ffffff",
    17	    },
    18	    errorCorrectionLevel: "M",
    19	  });
    20	}
    21	
    22	/**
    23	 * Generate a QR code as a data URL (base64) for embedding in HTML.
    24	 */
    25	export async function generateProfileQRDataURL(handle: string): Promise<string> {
    26	  const url = `${BASE_URL}/@${handle}`;
    27	  return QRCode.toDataURL(url, {
    28	    width: 512,
    29	    margin: 2,
    30	    color: {
    31	      dark: "#1c1917",
    32	      light: "#ffffff",
    33	    },
    34	    errorCorrectionLevel: "M",
    35	  });
    36	}
```

The QR encodes `https://rolodex.app/@handle` — the same public profile URL. Two output formats: a PNG buffer for the download endpoint (`/qr/:handle`) and a base64 data URL for inline embedding (`/qr/:handle/data-url`). The color `#1c1917` matches the stone-900 from the frontend prototype's design system. Error correction level "M" (15% recovery) balances scanability with data density.

## 10. Routes — Phase 2: Social Graph

### Friend Service

The friend service in `src/services/friends.ts` handles all graph operations. The canonical ordering is enforced by a helper:

```bash
sed -n '1,17p' src/services/friends.ts
```

```output
import { db } from "../db/index.js";
import { friendships, users } from "../db/schema.js";
import { eq, and, or, sql } from "drizzle-orm";
import type { FriendshipStatus } from "../db/schema.js";

/**
 * Canonical ordering: userA < userB to avoid duplicate rows.
 */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export const friendService = {
  /**
   * Get the friendship row between two users, if any.
   */
  async getFriendship(userIdA: string, userIdB: string) {
```

The `canonicalPair` function (line 9) is the lynchpin of the friendship model. UUIDs have a natural string ordering, so comparing `a < b` consistently picks the same order regardless of who calls the function. Every query and mutation in the service calls this before touching the database.

### Sending and accepting friend requests

```bash
sed -n '/async sendRequest/,/^  },/p' src/services/friends.ts
```

```output
  async sendRequest(
    fromId: string,
    toId: string
  ): Promise<{ ok: true } | { error: string }> {
    if (fromId === toId) return { error: "Cannot friend yourself" };

    const existing = await this.getFriendship(fromId, toId);
    if (existing) {
      if (existing.status === "accepted") return { error: "Already friends" };
      if (existing.status === "pending") return { error: "Request already pending" };
      if (existing.status === "blocked") return { error: "Cannot send request" };
    }

    const [a, b] = canonicalPair(fromId, toId);
    await db.insert(friendships).values({
      userA: a,
      userB: b,
      status: "pending",
      initiatedBy: fromId,
    });

    return { ok: true };
  },
```

```bash
sed -n '/async acceptRequest/,/^  },/p' src/services/friends.ts
```

```output
  async acceptRequest(
    acceptingUserId: string,
    fromUserId: string
  ): Promise<{ ok: true } | { error: string }> {
    const existing = await this.getFriendship(acceptingUserId, fromUserId);
    if (!existing) return { error: "No pending request found" };
    if (existing.status !== "pending") return { error: "No pending request found" };
    if (existing.initiatedBy === acceptingUserId) {
      return { error: "Cannot accept your own request" };
    }

    const [a, b] = canonicalPair(acceptingUserId, fromUserId);
    await db
      .update(friendships)
      .set({ status: "accepted" })
      .where(and(eq(friendships.userA, a), eq(friendships.userB, b)));

    return { ok: true };
  },
```

Both methods return a discriminated union — `{ ok: true }` or `{ error: string }` — which the route handlers pattern-match on with `"error" in result`. The `sendRequest` method checks five conditions before inserting: self-friending, already friends, request pending, and blocked. The `acceptRequest` method additionally verifies via `initiatedBy` that the accepting user is the recipient, not the sender — you can't accept your own request.

### Mutual friends computation

The mutual friends algorithm is straightforward set intersection:

```bash
sed -n '/async getMutualFriends/,/^  },/p' src/services/friends.ts
```

```output
  async getMutualFriends(userIdA: string, userIdB: string) {
    const friendsA = await this.getAllFriendIds(userIdA);
    const friendsB = await this.getAllFriendIds(userIdB);

    const setB = new Set(friendsB);
    const mutualIds = friendsA.filter((id) => setB.has(id));

    if (mutualIds.length === 0) return [];

    return db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(mutualIds.map(id => sql`${id}`), sql`, `)})`);
  },
```

Get all friend IDs for both users, then intersect using a `Set` for O(n) lookup. This is the application-level equivalent of SQL `INTERSECT`. For small graphs (<10K friends per user), this performs well. At scale, this would move to a single SQL query with `INTERSECT` or a join.

### Friend routes with notifications

The friend routes wire up the service and trigger notifications:

```bash
sed -n '/POST \/friends\/request\/:userId/,/^});/p' src/routes/friends.ts
```

```output
 * POST /friends/request/:userId — Send a friend request.
 */
friends.post("/friends/request/:userId", requireAuth, async (c) => {
  const fromId: string = c.get("userId");
  const toId = c.req.param("userId");

  // Verify target user exists
  const target = await db
    .select()
    .from(users)
    .where(eq(users.id, toId))
    .limit(1);
  if (target.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const result = await friendService.sendRequest(fromId, toId);
  if ("error" in result) {
    return c.json({ error: result.error }, 400);
  }

  // Send notification to the target user
  const sender = await db
    .select()
    .from(users)
    .where(eq(users.id, fromId))
    .limit(1);

  if (target[0].notifyFriendRequests) {
    await notificationService.create({
      userId: toId,
      type: "friend_request",
      fromUserId: fromId,
      message: `${sender[0]?.displayName ?? "Someone"} sent you a friend request.`,
    });
  }

  return c.json({ message: "Friend request sent" }, 201);
});
```

The route checks that the target user exists before delegating to the friend service. After a successful request, it conditionally creates a notification — respecting the target user's `notifyFriendRequests` preference from Phase 4. The accept route follows the same pattern, notifying the original requester if their `notifyFriendAccepted` preference allows it.

### Notification service

Notifications are stored in the database and served via API:

```bash
sed -n '1,37p' src/services/notifications.ts
```

```output
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export const notificationService = {
  async create(params: {
    userId: string;
    type: string;
    fromUserId: string;
    message: string;
  }): Promise<void> {
    await db.insert(notifications).values({
      id: uuid(),
      userId: params.userId,
      type: params.type,
      fromUserId: params.fromUserId,
      message: params.message,
    });
  },

  async listForUser(
    userId: string,
    opts: { limit?: number; offset?: number } = {}
  ) {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  },

```

The notification service is a thin CRUD layer. `create` inserts a row, `listForUser` returns paginated notifications sorted newest-first, `markRead` and `markAllRead` flip the boolean, and `unreadCount` returns the badge number. The routes in `src/routes/friends.ts` expose these as `/users/me/notifications`, `/users/me/notifications/:id/read`, and `/users/me/notifications/read-all`.

## 11. Routes — Phase 3: Discovery

### Suggestions engine

The suggestions endpoint finds friends-of-friends ranked by how many mutual connections exist:

```bash
sed -n '/GET \/discover\/suggestions/,/^});/p' src/routes/discovery.ts
```

```output
 * GET /discover/suggestions — Friends-of-friends ranked by mutual count.
 * Returns people who are friends with the user's friends, but not yet friends with the user.
 */
discovery.get("/discover/suggestions", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "20", 10);

  // Get all friend IDs
  const friendIds = await friendService.getAllFriendIds(userId);
  if (friendIds.length === 0) {
    return c.json({ suggestions: [] });
  }

  // For each friend, get their friends (friends-of-friends)
  const fofCounts = new Map<string, number>();
  for (const friendId of friendIds) {
    const friendOfFriendIds = await friendService.getAllFriendIds(friendId);
    for (const fofId of friendOfFriendIds) {
      // Exclude self and existing friends
      if (fofId === userId || friendIds.includes(fofId)) continue;
      fofCounts.set(fofId, (fofCounts.get(fofId) || 0) + 1);
    }
  }

  // Sort by mutual count descending
  const ranked = [...fofCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  if (ranked.length === 0) {
    return c.json({ suggestions: [] });
  }

  // Fetch user details
  const rankedIds = ranked.map(([id]) => id);
  const userRows = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(sql`${users.id} IN (${sql.join(rankedIds.map(id => sql`${id}`), sql`, `)})`);

  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const suggestions = ranked
    .map(([id, mutualCount]) => ({
      ...userMap.get(id),
      mutualFriendCount: mutualCount,
    }))
    .filter((s) => s.id);

  return c.json({ suggestions });
});
```

The algorithm: for each of the user's friends, fetch *their* friends. Count how many times each non-friend appears (that's the mutual friend count). Sort descending and take the top N. This is O(friends * avg_friends_per_friend) which is fine for social graphs under ~10K connections. At scale, this would be a single SQL query with joins and GROUP BY.

The exclusion logic on line 20 (`if fofId === userId || friendIds.includes(fofId)`) prevents suggesting yourself or people you're already friends with.

### Search

The search endpoint stubs PostgreSQL's `pg_trgm` trigram matching with SQLite's `LIKE`:

```bash
sed -n '/GET \/discover\/search/,/^});/p' src/routes/discovery.ts
```

```output
 * GET /discover/search?q= — Full-text search on name + handle.
 *
 * Stubs pg_trgm similarity search with basic LIKE matching.
 * In production with PostgreSQL, use:
 *   WHERE similarity(display_name, $1) > 0.3
 *      OR display_name ILIKE '%' || $1 || '%'
 *      OR handle ILIKE '%' || $1 || '%'
 *   ORDER BY similarity(display_name, $1) DESC
 */
discovery.get("/discover/search", requireAuth, async (c) => {
  const query = c.req.query("q") || "";
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  if (query.length < 2) {
    return c.json({ error: "Query must be at least 2 characters" }, 400);
  }

  // SQLite stub for pg_trgm — uses LIKE for basic matching
  const pattern = `%${query}%`;
  const results = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      sql`${users.displayName} LIKE ${pattern} OR ${users.handle} LIKE ${pattern}`
    )
    .limit(limit)
    .offset(offset);

  return c.json({ results, query });
});
```

The comment block documents the exact PostgreSQL query that would replace this in production. The `pg_trgm` extension provides fuzzy matching — \"jon\" would match \"John\" with a similarity score — while the SQLite `LIKE` stub requires exact substring matches. The 2-character minimum prevents expensive full-table scans on single-character queries.

## 12. Routes — Phase 4: Polish & Export

### vCard and CSV libraries

The export system uses two format-specific libraries. The vCard generator maps Rolodex contact types to standard and custom vCard fields:

```bash
sed -n '/function contactToVCard/,/^}/p' src/lib/vcard.ts
```

```output
function contactToVCard(contact: VCardContact): string {
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(contact.displayName)}`,
  ];

  if (contact.handle) {
    lines.push(`NOTE:Rolodex @${contact.handle}`);
  }

  for (const c of contact.contacts) {
    switch (c.type) {
      case "phone":
        lines.push(`TEL;TYPE=CELL:${c.value}`);
        break;
      case "email":
        lines.push(`EMAIL;TYPE=INTERNET:${c.value}`);
        break;
      case "whatsapp":
        lines.push(`X-WHATSAPP:${c.value}`);
        break;
      case "telegram":
        lines.push(`X-TELEGRAM:${c.value}`);
        break;
      case "signal":
        lines.push(`X-SIGNAL:${c.value}`);
        break;
      case "snapchat":
        lines.push(`X-SNAPCHAT:${c.value}`);
        break;
      case "instagram":
        lines.push(`X-INSTAGRAM:${c.value}`);
        break;
      default:
        lines.push(`X-${c.type.toUpperCase()}:${c.value}`);
        break;
    }
  }

  lines.push("END:VCARD");
  return lines.join("\r\n");
}
```

Standard vCard 3.0 fields are used for phone (`TEL;TYPE=CELL`) and email (`EMAIL;TYPE=INTERNET`). Messaging apps use `X-` prefixed custom properties — these are valid vCard extensions and some contact apps will recognize them. The Rolodex handle is stored in the `NOTE` field for reference. The parser (`parseVCards`) handles the reverse direction, recognizing these same fields when importing.

### Export routes

The export endpoints stream contact data in the requested format, respecting visibility:

```bash
sed -n '/GET \/export\/vcf/,/^});/p' src/routes/export.ts
```

```output
 * GET /export/vcf — Download friends as vCard file.
 */
exportRouter.get("/export/vcf", requireAuth, async (c) => {
  const userId: string = c.get("userId");

  const friendIds = await friendService.getAllFriendIds(userId);
  if (friendIds.length === 0) {
    return c.json({ error: "No friends to export" }, 404);
  }

  // Fetch friend users
  const friendUsers = await db
    .select()
    .from(users)
    .where(sql`${users.id} IN (${sql.join(friendIds.map(id => sql`${id}`), sql`, `)})`);

  // For each friend, get their visible contact links
  const vcardContacts = [];
  for (const friend of friendUsers) {
    const links = await db
      .select()
      .from(contactLinks)
      .where(eq(contactLinks.userId, friend.id));

    const visibleLinks = await filterContactLinks(links, friend.id, userId);

    vcardContacts.push({
      displayName: friend.displayName,
      handle: friend.handle,
      contacts: visibleLinks.map((l) => ({
        type: l.type,
        label: l.label,
        value: l.value,
      })),
    });
  }

  const vcf = generateVCards(vcardContacts);

  c.header("Content-Type", "text/vcard; charset=utf-8");
  c.header("Content-Disposition", "attachment; filename=\"rolodex-contacts.vcf\"");
  return c.body(vcf);
});
```

The export respects the same visibility rules as the profile page — you only export contact links your friends have made visible to you. The `Content-Disposition: attachment` header triggers a file download in browsers. The CSV export follows the same pattern but flattens each contact link into its own row (one row per link, not one row per friend).

### Import with user matching

The import endpoints parse uploaded files and try to match contacts against existing Rolodex users:

```bash
sed -n '/POST \/import\/vcf/,/^});/p' src/routes/export.ts
```

```output
 * POST /import/vcf — Upload a .vcf file, parse and match against existing users.
 * Body: multipart/form-data with a "file" field.
 */
exportRouter.post("/import/vcf", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "file is required" }, 400);
  }

  const content = await file.text();
  const parsed = parseVCards(content);

  // Try to match parsed contacts against existing users by name
  const matched: Array<{ displayName: string; handle?: string; userId?: string }> = [];
  const unmatched: Array<{ displayName: string }> = [];

  for (const card of parsed) {
    // Search for matching users by display name
    const pattern = `%${card.displayName}%`;
    const found = await db
      .select({ id: users.id, handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(sql`${users.displayName} LIKE ${pattern}`)
      .limit(1);

    if (found.length > 0) {
      matched.push({
        displayName: card.displayName,
        handle: found[0].handle,
        userId: found[0].id,
      });
    } else {
      unmatched.push({ displayName: card.displayName });
    }
  }

  return c.json({
    total: parsed.length,
    matched,
    unmatched,
    message: `Parsed ${parsed.length} contacts. ${matched.length} matched existing users.`,
  });
});
```

Import doesn't automatically create friendships — it returns matched and unmatched lists so the client can prompt the user to send friend requests. The matching is name-based (`LIKE` query against `display_name`), which is intentionally fuzzy. The response gives the client everything it needs to build a "we found these people on Rolodex" UI.

### Settings and account deletion

The settings routes manage privacy and notification preferences:

```bash
sed -n '/DELETE \/settings\/account/,/^});/p' src/routes/settings.ts
```

```output
 * DELETE /settings/account — Delete the user's account and all associated data.
 * Requires confirmation in the body: { confirm: true }
 */
settings.delete("/settings/account", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const body = await c.req.json<{ confirm?: boolean }>();

  if (!body.confirm) {
    return c.json(
      { error: "Account deletion requires { confirm: true } in the request body" },
      400
    );
  }

  // Delete all user data (cascading deletes handle contact_links and notifications)
  // Friendships need manual cleanup since user could be in either column
  await db
    .delete(friendships)
    .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));

  // Delete magic links for this user's email
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user.length > 0) {
    await db.delete(magicLinks).where(eq(magicLinks.email, user[0].email));
  }

  // Delete the user (cascades to contact_links and notifications)
  await db.delete(users).where(eq(users.id, userId));

  return c.json({ message: "Account deleted successfully" });
});
```

Account deletion requires an explicit `{ confirm: true }` in the request body — a safeguard against accidental DELETE calls. The cleanup order matters: friendships are deleted first (manually, since the user could be in either column and the canonical ordering means we can't rely on a single FK cascade), then magic links, then the user row itself. The user deletion cascades to `contact_links` and `notifications` via the `ON DELETE CASCADE` foreign keys in the schema.

## 13. How a Request Flows Through the System

To tie it all together, here's the path of a typical request — viewing a profile at `GET /users/alice`:

1. **Hono server** receives the HTTP request via `@hono/node-server`
2. **Logger middleware** logs the method and path
3. **CORS middleware** adds cross-origin headers
4. **`optionalAuth` middleware** checks for a Bearer token — if present, sets `userId` on context
5. **Profile route handler** runs:
   - Looks up `alice` in the `users` table by handle
   - Fetches all `contact_links` for that user, ordered by `sort_order`
   - Calls `filterContactLinks()` which checks each link's `visibility` against the viewer's relationship to Alice
   - If authenticated, computes mutual friend count and relationship status
6. **JSON response** is returned with the profile data and only the contact links the viewer is allowed to see

The key insight is that the same endpoint serves different data to different viewers — an anonymous visitor, a friend, and a friend-of-friend each see a different set of contact links, all from the same URL.

## 14. File Tree Summary

Here's the complete source tree with each file's role:

```bash
find src -type f -name '*.ts' | sort
```

```output
src/app.ts
src/db/index.ts
src/db/migrate-runtime.ts
src/db/migrate.ts
src/db/schema.ts
src/index.ts
src/lib/csv.ts
src/lib/qr.ts
src/lib/rate-limit.ts
src/lib/vcard.ts
src/middleware/auth.ts
src/routes/auth.ts
src/routes/discovery.ts
src/routes/export.ts
src/routes/friends.ts
src/routes/profile.ts
src/routes/qr.ts
src/routes/settings.ts
src/services/auth.ts
src/services/cache.ts
src/services/email.ts
src/services/friends.ts
src/services/notifications.ts
src/services/storage.ts
src/services/visibility.ts
src/types.ts
```

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — starts server, triggers migrations |
| `src/app.ts` | Hono app shell — middleware, rate limits, route registration |
| `src/types.ts` | Shared `AppEnv` type for type-safe Hono context |
| `src/db/schema.ts` | Drizzle ORM schema — all 5 tables |
| `src/db/index.ts` | SQLite connection with WAL mode |
| `src/db/migrate-runtime.ts` | Auto-migration on startup |
| `src/db/migrate.ts` | CLI migration script |
| `src/middleware/auth.ts` | `requireAuth` and `optionalAuth` JWT middleware |
| `src/services/auth.ts` | JWT tokens, magic links, registration |
| `src/services/cache.ts` | Redis stub — in-memory Map with TTL |
| `src/services/email.ts` | Email stub — console.log |
| `src/services/storage.ts` | R2/S3 stub — local filesystem |
| `src/services/friends.ts` | Friend graph operations (canonical pairs, mutuals) |
| `src/services/notifications.ts` | Notification CRUD |
| `src/services/visibility.ts` | Contact link visibility filtering |
| `src/routes/auth.ts` | Auth endpoints (register, login, magic-link, refresh) |
| `src/routes/profile.ts` | Profile CRUD, contact links, avatar upload |
| `src/routes/friends.ts` | Friend requests, friend list, notifications |
| `src/routes/discovery.ts` | Suggestions engine, search |
| `src/routes/export.ts` | vCard/CSV export and import |
| `src/routes/settings.ts` | Privacy, notification prefs, account deletion |
| `src/routes/qr.ts` | QR code generation (PNG and data URL) |
| `src/lib/qr.ts` | QR code library (wraps `qrcode` package) |
| `src/lib/vcard.ts` | vCard 3.0 generation and parsing |
| `src/lib/csv.ts` | CSV generation and parsing |
| `src/lib/rate-limit.ts` | Rate limiting middleware via cache service |
