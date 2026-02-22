import { Hono } from "hono";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { friendService } from "../services/friends.js";
import type { AppEnv } from "../types.js";

const discovery = new Hono<AppEnv>();

/**
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

/**
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

export default discovery;
