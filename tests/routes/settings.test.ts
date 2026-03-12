import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser, makeFriends } from "../helpers.js";
import { db } from "../../src/db/index.js";
import { users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("settings routes", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("GET /settings", () => {
    it("requires authentication", async () => {
      const res = await request("GET", "/settings");
      expect(res.status).toBe(401);
    });

    it("returns user settings", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/settings", { token: alice.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("isPublic");
      expect(body).toHaveProperty("notifyFriendRequests");
      expect(body).toHaveProperty("notifyFriendAccepted");
    });
  });

  describe("PATCH /settings", () => {
    it("updates isPublic", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/settings", {
        body: { isPublic: false },
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isPublic).toBe(false);
    });

    it("updates notification preferences", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/settings", {
        body: { notifyFriendRequests: false, notifyFriendAccepted: false },
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notifyFriendRequests).toBe(false);
      expect(body.notifyFriendAccepted).toBe(false);
    });

    it("rejects empty update", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/settings", {
        body: {},
        token: alice.accessToken,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /settings/account", () => {
    it("requires confirmation", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("DELETE", "/settings/account", {
        body: {},
        token: alice.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("deletes user account with confirm: true", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("DELETE", "/settings/account", {
        body: { confirm: true },
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);

      // Verify user is gone
      const rows = await db.select().from(users).where(eq(users.id, alice.id));
      expect(rows).toHaveLength(0);
    });

    it("cleans up friendships on deletion", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      await request("DELETE", "/settings/account", {
        body: { confirm: true },
        token: alice.accessToken,
      });

      // Bob should have no friends left
      const friendsRes = await request("GET", "/users/me/friends", { token: bob.accessToken });
      const body = await friendsRes.json();
      expect(body.total).toBe(0);
    });
  });
});
