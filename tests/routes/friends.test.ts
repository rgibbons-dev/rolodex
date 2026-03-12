import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser, makeFriends } from "../helpers.js";

describe("friends routes", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("GET /users/me/friends", () => {
    it("requires authentication", async () => {
      const res = await request("GET", "/users/me/friends");
      expect(res.status).toBe(401);
    });

    it("returns friend list", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const res = await request("GET", "/users/me/friends", { token: alice.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.friends).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("returns empty list when no friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/users/me/friends", { token: alice.accessToken });
      const body = await res.json();
      expect(body.friends).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, bob.id);
      await makeFriends(alice.id, carol.id);

      const res = await request("GET", "/users/me/friends?limit=1", { token: alice.accessToken });
      const body = await res.json();
      expect(body.friends).toHaveLength(1);
      expect(body.total).toBe(2);
    });

    it("caps limit at 100", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/users/me/friends?limit=999", { token: alice.accessToken });
      expect(res.status).toBe(200);
    });
  });

  describe("POST /friends/request/:userId", () => {
    it("sends a friend request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });

      const res = await request("POST", `/friends/request/${bob.id}`, { token: alice.accessToken });
      expect(res.status).toBe(201);
    });

    it("returns 404 for nonexistent target", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/friends/request/nonexistent-id", { token: alice.accessToken });
      expect(res.status).toBe(404);
    });

    it("rejects duplicate request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await request("POST", `/friends/request/${bob.id}`, { token: alice.accessToken });
      const res = await request("POST", `/friends/request/${bob.id}`, { token: alice.accessToken });
      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const bob = await createTestUser({ handle: "bob" });
      const res = await request("POST", `/friends/request/${bob.id}`);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /friends/accept/:userId", () => {
    it("accepts a pending request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await request("POST", `/friends/request/${bob.id}`, { token: alice.accessToken });

      const res = await request("POST", `/friends/accept/${alice.id}`, { token: bob.accessToken });
      expect(res.status).toBe(200);

      // Verify they're friends now
      const friendsRes = await request("GET", "/users/me/friends", { token: alice.accessToken });
      const body = await friendsRes.json();
      expect(body.total).toBe(1);
    });

    it("rejects accepting own request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await request("POST", `/friends/request/${bob.id}`, { token: alice.accessToken });

      const res = await request("POST", `/friends/accept/${bob.id}`, { token: alice.accessToken });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /friends/:userId", () => {
    it("removes a friendship", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const res = await request("DELETE", `/friends/${bob.id}`, { token: alice.accessToken });
      expect(res.status).toBe(200);

      const friendsRes = await request("GET", "/users/me/friends", { token: alice.accessToken });
      const body = await friendsRes.json();
      expect(body.total).toBe(0);
    });

    it("returns 404 for nonexistent friendship", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const res = await request("DELETE", `/friends/${bob.id}`, { token: alice.accessToken });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /users/me/friends/requests", () => {
    it("lists pending friend requests", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await request("POST", `/friends/request/${alice.id}`, { token: bob.accessToken });

      const res = await request("GET", "/users/me/friends/requests", { token: alice.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.requests).toHaveLength(1);
    });
  });

  describe("GET /users/:handle/friends", () => {
    it("shows public user's friend list", async () => {
      const alice = await createTestUser({ handle: "alice", isPublic: true });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const res = await request("GET", "/users/alice/friends");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.friends).toHaveLength(1);
    });

    it("hides private user's friend list from non-friends", async () => {
      const alice = await createTestUser({ handle: "alice", isPublic: false });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const carol = await createTestUser({ handle: "carol" });
      const res = await request("GET", "/users/alice/friends", { token: carol.accessToken });
      expect(res.status).toBe(403);
    });

    it("shows private user's friend list to their friends", async () => {
      const alice = await createTestUser({ handle: "alice", isPublic: false });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const res = await request("GET", "/users/alice/friends", { token: bob.accessToken });
      expect(res.status).toBe(200);
    });
  });

  describe("GET /users/:handle/mutuals", () => {
    it("returns mutual friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, carol.id);
      await makeFriends(bob.id, carol.id);

      const res = await request("GET", "/users/alice/mutuals", { token: bob.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.mutuals[0].handle).toBe("carol");
    });
  });

  describe("notifications", () => {
    it("GET /users/me/notifications requires auth", async () => {
      const res = await request("GET", "/users/me/notifications");
      expect(res.status).toBe(401);
    });

    it("sends notification on friend request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await request("POST", `/friends/request/${bob.id}`, { token: alice.accessToken });

      const res = await request("GET", "/users/me/notifications", { token: bob.accessToken });
      const body = await res.json();
      expect(body.notifications).toHaveLength(1);
      expect(body.notifications[0].type).toBe("friend_request");
      expect(body.unreadCount).toBe(1);
    });

    it("POST /users/me/notifications/read-all marks all as read", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await request("POST", `/friends/request/${alice.id}`, { token: bob.accessToken });

      await request("POST", "/users/me/notifications/read-all", { token: alice.accessToken });
      const res = await request("GET", "/users/me/notifications", { token: alice.accessToken });
      const body = await res.json();
      expect(body.unreadCount).toBe(0);
    });

    it("POST /users/me/notifications/:id/read marks one as read", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await request("POST", `/friends/request/${alice.id}`, { token: bob.accessToken });

      const listRes = await request("GET", "/users/me/notifications", { token: alice.accessToken });
      const listBody = await listRes.json();
      const notifId = listBody.notifications[0].id;

      const res = await request("POST", `/users/me/notifications/${notifId}/read`, { token: alice.accessToken });
      expect(res.status).toBe(200);
    });

    it("returns 404 for nonexistent notification", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/notifications/nonexistent/read", { token: alice.accessToken });
      expect(res.status).toBe(404);
    });
  });
});
