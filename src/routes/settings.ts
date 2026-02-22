import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, friendships, magicLinks } from "../db/schema.js";
import { eq, or } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

const settings = new Hono<AppEnv>();

/**
 * GET /settings — Get current user settings.
 */
settings.get("/settings", requireAuth, async (c) => {
  const userId: string = c.get("userId");

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    isPublic: user[0].isPublic,
    notifyFriendRequests: user[0].notifyFriendRequests,
    notifyFriendAccepted: user[0].notifyFriendAccepted,
  });
});

/**
 * PATCH /settings — Update user settings.
 * Body: { isPublic?, notifyFriendRequests?, notifyFriendAccepted? }
 */
settings.patch("/settings", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const body = await c.req.json<{
    isPublic?: boolean;
    notifyFriendRequests?: boolean;
    notifyFriendAccepted?: boolean;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.isPublic !== undefined) updates.isPublic = body.isPublic;
  if (body.notifyFriendRequests !== undefined)
    updates.notifyFriendRequests = body.notifyFriendRequests;
  if (body.notifyFriendAccepted !== undefined)
    updates.notifyFriendAccepted = body.notifyFriendAccepted;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  const updated = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return c.json({
    isPublic: updated[0].isPublic,
    notifyFriendRequests: updated[0].notifyFriendRequests,
    notifyFriendAccepted: updated[0].notifyFriendAccepted,
  });
});

/**
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

export default settings;
