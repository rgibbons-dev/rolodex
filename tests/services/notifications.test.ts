import { describe, it, expect, beforeEach } from "vitest";
import { notificationService } from "../../src/services/notifications.js";
import { cleanDB, createTestUser } from "../helpers.js";

describe("notification service", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  it("creates a notification", async () => {
    const alice = await createTestUser({ handle: "alice" });
    const bob = await createTestUser({ handle: "bob" });
    await notificationService.create({
      userId: alice.id,
      type: "friend_request",
      fromUserId: bob.id,
      message: "Bob sent a friend request",
    });
    const items = await notificationService.listForUser(alice.id);
    expect(items).toHaveLength(1);
    expect(items[0].message).toBe("Bob sent a friend request");
    expect(items[0].read).toBe(false);
  });

  it("marks a notification as read", async () => {
    const alice = await createTestUser({ handle: "alice" });
    const bob = await createTestUser({ handle: "bob" });
    await notificationService.create({
      userId: alice.id,
      type: "friend_request",
      fromUserId: bob.id,
      message: "Test",
    });
    const items = await notificationService.listForUser(alice.id);
    const ok = await notificationService.markRead(items[0].id, alice.id);
    expect(ok).toBe(true);

    const updated = await notificationService.listForUser(alice.id);
    expect(updated[0].read).toBe(true);
  });

  it("returns false when marking non-existent notification", async () => {
    const alice = await createTestUser({ handle: "alice" });
    const ok = await notificationService.markRead("nonexistent", alice.id);
    expect(ok).toBe(false);
  });

  it("marks all as read", async () => {
    const alice = await createTestUser({ handle: "alice" });
    const bob = await createTestUser({ handle: "bob" });
    await notificationService.create({ userId: alice.id, type: "t", fromUserId: bob.id, message: "1" });
    await notificationService.create({ userId: alice.id, type: "t", fromUserId: bob.id, message: "2" });
    await notificationService.markAllRead(alice.id);

    const count = await notificationService.unreadCount(alice.id);
    expect(count).toBe(0);
  });

  it("counts unread notifications", async () => {
    const alice = await createTestUser({ handle: "alice" });
    const bob = await createTestUser({ handle: "bob" });
    await notificationService.create({ userId: alice.id, type: "t", fromUserId: bob.id, message: "1" });
    await notificationService.create({ userId: alice.id, type: "t", fromUserId: bob.id, message: "2" });

    expect(await notificationService.unreadCount(alice.id)).toBe(2);
  });

  it("respects pagination", async () => {
    const alice = await createTestUser({ handle: "alice" });
    const bob = await createTestUser({ handle: "bob" });
    for (let i = 0; i < 5; i++) {
      await notificationService.create({ userId: alice.id, type: "t", fromUserId: bob.id, message: `msg${i}` });
    }
    const page = await notificationService.listForUser(alice.id, { limit: 2 });
    expect(page).toHaveLength(2);
  });
});
