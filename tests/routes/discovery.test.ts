import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser, makeFriends } from "../helpers.js";

describe("discovery routes", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("GET /discover/suggestions", () => {
    it("requires authentication", async () => {
      const res = await request("GET", "/discover/suggestions");
      expect(res.status).toBe(401);
    });

    it("returns empty when user has no friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/discover/suggestions", { token: alice.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.suggestions).toHaveLength(0);
    });

    it("suggests friends-of-friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, bob.id);
      await makeFriends(bob.id, carol.id);

      const res = await request("GET", "/discover/suggestions", { token: alice.accessToken });
      const body = await res.json();
      expect(body.suggestions).toHaveLength(1);
      expect(body.suggestions[0].handle).toBe("carol");
      expect(body.suggestions[0].mutualFriendCount).toBe(1);
    });

    it("does not suggest existing friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, bob.id);
      await makeFriends(alice.id, carol.id);
      await makeFriends(bob.id, carol.id);

      const res = await request("GET", "/discover/suggestions", { token: alice.accessToken });
      const body = await res.json();
      // Carol and Bob are both already friends, so no suggestions
      expect(body.suggestions).toHaveLength(0);
    });
  });

  describe("GET /discover/search", () => {
    it("requires authentication", async () => {
      const res = await request("GET", "/discover/search?q=alice");
      expect(res.status).toBe(401);
    });

    it("rejects query shorter than 2 chars", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/discover/search?q=a", { token: alice.accessToken });
      expect(res.status).toBe(400);
    });

    it("searches by display name", async () => {
      const alice = await createTestUser({ handle: "alice", displayName: "Alice Smith" });
      const bob = await createTestUser({ handle: "bob", displayName: "Bob Jones" });

      const res = await request("GET", "/discover/search?q=Alice", { token: bob.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toHaveLength(1);
      expect(body.results[0].handle).toBe("alice");
    });

    it("searches by handle", async () => {
      const alice = await createTestUser({ handle: "alice", displayName: "Alice" });
      const bob = await createTestUser({ handle: "bob" });

      const res = await request("GET", "/discover/search?q=alice", { token: bob.accessToken });
      const body = await res.json();
      expect(body.results).toHaveLength(1);
    });

    it("returns empty for no matches", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/discover/search?q=zzzzz", { token: alice.accessToken });
      const body = await res.json();
      expect(body.results).toHaveLength(0);
    });

    it("respects limit parameter", async () => {
      const viewer = await createTestUser({ handle: "viewer" });
      for (let i = 0; i < 5; i++) {
        await createTestUser({ handle: `test_user_${i}`, displayName: `Test User ${i}` });
      }
      const res = await request("GET", "/discover/search?q=Test&limit=2", { token: viewer.accessToken });
      const body = await res.json();
      expect(body.results).toHaveLength(2);
    });
  });
});
