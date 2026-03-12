import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { dirname } from "path";

// Set env vars before any app imports
process.env.JWT_SECRET = "test-secret-key-for-vitest-only-do-not-use-in-prod";
process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "http://localhost:3000";

// Use a file-based test DB (better-sqlite3 doesn't support :memory: well across modules)
const TEST_DB = "./data/test-rolodex.db";
process.env.DATABASE_URL = TEST_DB;

const dir = dirname(TEST_DB);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// Delete and recreate test DB before each test run
try {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  if (existsSync(TEST_DB + "-wal")) unlinkSync(TEST_DB + "-wal");
  if (existsSync(TEST_DB + "-shm")) unlinkSync(TEST_DB + "-shm");
} catch {
  // May fail if locked — ignore
}

const sqlite = new Database(TEST_DB);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar_url TEXT,
    is_public INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    notify_friend_requests INTEGER NOT NULL DEFAULT 1,
    notify_friend_accepted INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS contact_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'friends_only'
  );
  CREATE INDEX IF NOT EXISTS contact_links_user_idx ON contact_links(user_id);

  CREATE TABLE IF NOT EXISTS friendships (
    user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    initiated_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_a, user_b)
  );
  CREATE INDEX IF NOT EXISTS friendships_user_a_idx ON friendships(user_a);
  CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON friendships(user_b);

  CREATE TABLE IF NOT EXISTS magic_links (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    from_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id);
`);

sqlite.close();
