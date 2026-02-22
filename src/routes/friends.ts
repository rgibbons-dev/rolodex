import { Hono } from "hono";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { friendService } from "../services/friends.js";
import { notificationService } from "../services/notifications.js";
import type { AppEnv } from "../types.js";

const friends = new Hono<AppEnv>();

/**
 * GET /users/me/friends — Paginated friend list for the authenticated user.
 */
friends.get("/users/me/friends", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const result = await friendService.listFriends(userId, { limit, offset });
  return c.json(result);
});

/**
 * GET /users/me/friends/requests — Pending friend requests received.
 */
friends.get("/users/me/friends/requests", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const requests = await friendService.listPendingRequests(userId);
  return c.json({ requests });
});

/**
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

/**
 * POST /friends/accept/:userId — Accept a pending friend request.
 */
friends.post("/friends/accept/:userId", requireAuth, async (c) => {
  const acceptingUserId: string = c.get("userId");
  const fromUserId = c.req.param("userId");

  const result = await friendService.acceptRequest(acceptingUserId, fromUserId);
  if ("error" in result) {
    return c.json({ error: result.error }, 400);
  }

  // Notify the original requester
  const acceptor = await db
    .select()
    .from(users)
    .where(eq(users.id, acceptingUserId))
    .limit(1);

  const requester = await db
    .select()
    .from(users)
    .where(eq(users.id, fromUserId))
    .limit(1);

  if (requester[0]?.notifyFriendAccepted) {
    await notificationService.create({
      userId: fromUserId,
      type: "friend_accepted",
      fromUserId: acceptingUserId,
      message: `${acceptor[0]?.displayName ?? "Someone"} accepted your friend request.`,
    });
  }

  return c.json({ message: "Friend request accepted" });
});

/**
 * DELETE /friends/:userId — Unfriend or cancel a pending request.
 */
friends.delete("/friends/:userId", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const otherUserId = c.req.param("userId");

  const result = await friendService.removeFriendship(userId, otherUserId);
  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  return c.json({ message: "Friendship removed" });
});

/**
 * GET /users/:handle/friends — Their friend list (if public).
 */
friends.get("/users/:handle/friends", optionalAuth, async (c) => {
  const handle = c.req.param("handle");
  const viewerId: string | undefined = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const user = await db
    .select()
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const u = user[0];

  // Only show friend list if user is public, or viewer is a friend
  if (!u.isPublic && viewerId !== u.id) {
    const relationship = viewerId
      ? await friendService.getRelationship(u.id, viewerId)
      : "none";
    if (relationship !== "accepted") {
      return c.json({ error: "This user's friend list is private" }, 403);
    }
  }

  const result = await friendService.listFriends(u.id, { limit, offset });
  return c.json(result);
});

/**
 * GET /users/:handle/mutuals — Mutual friends with the caller.
 */
friends.get("/users/:handle/mutuals", requireAuth, async (c) => {
  const viewerId: string = c.get("userId");
  const handle = c.req.param("handle");

  const user = await db
    .select()
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const mutuals = await friendService.getMutualFriends(user[0].id, viewerId);
  return c.json({ mutuals, count: mutuals.length });
});

/**
 * GET /users/me/notifications — List notifications.
 */
friends.get("/users/me/notifications", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  const items = await notificationService.listForUser(userId, { limit, offset });
  const unread = await notificationService.unreadCount(userId);

  return c.json({ notifications: items, unreadCount: unread });
});

/**
 * POST /users/me/notifications/:id/read — Mark a notification as read.
 */
friends.post("/users/me/notifications/:id/read", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const notifId = c.req.param("id");

  const ok = await notificationService.markRead(notifId, userId);
  if (!ok) {
    return c.json({ error: "Notification not found" }, 404);
  }
  return c.json({ message: "Marked as read" });
});

/**
 * POST /users/me/notifications/read-all — Mark all notifications as read.
 */
friends.post("/users/me/notifications/read-all", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  await notificationService.markAllRead(userId);
  return c.json({ message: "All notifications marked as read" });
});

export default friends;
