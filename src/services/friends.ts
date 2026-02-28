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
    const [a, b] = canonicalPair(userIdA, userIdB);
    const rows = await db
      .select()
      .from(friendships)
      .where(and(eq(friendships.userA, a), eq(friendships.userB, b)))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Send a friend request from `fromId` to `toId`.
   */
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

  /**
   * Accept a pending friend request.
   * Only the recipient (non-initiator) can accept.
   */
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

  /**
   * Unfriend or cancel a pending request.
   */
  async removeFriendship(
    userId: string,
    otherUserId: string
  ): Promise<{ ok: true } | { error: string }> {
    const [a, b] = canonicalPair(userId, otherUserId);
    const result = await db
      .delete(friendships)
      .where(and(eq(friendships.userA, a), eq(friendships.userB, b)));

    if (result.changes === 0) return { error: "No friendship found" };
    return { ok: true };
  },

  /**
   * Get paginated list of accepted friends for a user.
   */
  async listFriends(
    userId: string,
    opts: { limit?: number; offset?: number } = {}
  ) {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    // Friends where user is userA
    const asA = db
      .select({
        friendId: friendships.userB,
        since: friendships.createdAt,
      })
      .from(friendships)
      .where(and(eq(friendships.userA, userId), eq(friendships.status, "accepted")));

    // Friends where user is userB
    const asB = db
      .select({
        friendId: friendships.userA,
        since: friendships.createdAt,
      })
      .from(friendships)
      .where(and(eq(friendships.userB, userId), eq(friendships.status, "accepted")));

    const allFriends = [...(await asA), ...(await asB)];

    // Sort by createdAt descending, then paginate
    allFriends.sort((a, b) => (b.since > a.since ? 1 : -1));
    const page = allFriends.slice(offset, offset + limit);

    if (page.length === 0) return { friends: [], total: allFriends.length };

    // Fetch user details for friend IDs
    const friendIds = page.map((f) => f.friendId);
    const friendUsers = await db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        bio: users.bio,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(friendIds.map(id => sql`${id}`), sql`, `)})`);

    // Merge with since dates
    const friendMap = new Map(friendUsers.map((u) => [u.id, u]));
    const friends = page
      .map((f) => ({
        ...friendMap.get(f.friendId),
        since: f.since,
      }))
      .filter((f) => f.id); // filter out any missing users

    return { friends, total: allFriends.length };
  },

  /**
   * Get pending friend requests received by the user.
   */
  async listPendingRequests(userId: string) {
    // Pending requests where the user is NOT the initiator
    const asA = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.userA, userId),
          eq(friendships.status, "pending"),
          sql`${friendships.initiatedBy} != ${userId}`
        )
      );

    const asB = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.userB, userId),
          eq(friendships.status, "pending"),
          sql`${friendships.initiatedBy} != ${userId}`
        )
      );

    const all = [...asA, ...asB];
    const senderIds = all.map((f) => f.initiatedBy);

    if (senderIds.length === 0) return [];

    const senders = await db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(senderIds.map(id => sql`${id}`), sql`, `)})`);

    const senderMap = new Map(senders.map((s) => [s.id, s]));
    return all.map((f) => ({
      ...senderMap.get(f.initiatedBy),
      requestedAt: f.createdAt,
    }));
  },

  /**
   * Get mutual friends between two users.
   */
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

  /**
   * Get all accepted friend IDs for a user.
   */
  async getAllFriendIds(userId: string): Promise<string[]> {
    const asA = await db
      .select({ friendId: friendships.userB })
      .from(friendships)
      .where(and(eq(friendships.userA, userId), eq(friendships.status, "accepted")));

    const asB = await db
      .select({ friendId: friendships.userA })
      .from(friendships)
      .where(and(eq(friendships.userB, userId), eq(friendships.status, "accepted")));

    return [...asA.map((r) => r.friendId), ...asB.map((r) => r.friendId)];
  },

  /**
   * Check the relationship status between two users.
   */
  async getRelationship(
    userId: string,
    otherUserId: string
  ): Promise<FriendshipStatus | "none"> {
    const friendship = await this.getFriendship(userId, otherUserId);
    return friendship?.status ?? "none";
  },
};
