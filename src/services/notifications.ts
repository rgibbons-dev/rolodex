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

  async markRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.id, notificationId), eq(notifications.userId, userId))
      );
    return result.changes > 0;
  },

  async markAllRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId));
  },

  async unreadCount(userId: string): Promise<number> {
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return rows.length;
  },
};
