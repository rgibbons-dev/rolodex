import { describe, it, expect, beforeEach } from "vitest";
import { friendService } from "../../src/services/friends.js";
import { cleanDB, createTestUser, makeFriends } from "../helpers.js";

describe("friend service", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("sendRequest", () => {
    it("sends a friend request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const result = await friendService.sendRequest(alice.id, bob.id);
      expect(result).toEqual({ ok: true });
    });

    it("rejects self-friending", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const result = await friendService.sendRequest(alice.id, alice.id);
      expect(result).toEqual({ error: "Cannot friend yourself" });
    });

    it("rejects duplicate request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await friendService.sendRequest(alice.id, bob.id);
      const result = await friendService.sendRequest(alice.id, bob.id);
      expect(result).toEqual({ error: "Request already pending" });
    });

    it("rejects request if already friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);
      const result = await friendService.sendRequest(alice.id, bob.id);
      expect(result).toEqual({ error: "Already friends" });
    });
  });

  describe("acceptRequest", () => {
    it("accepts a pending request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await friendService.sendRequest(alice.id, bob.id);
      const result = await friendService.acceptRequest(bob.id, alice.id);
      expect(result).toEqual({ ok: true });
    });

    it("rejects accepting own request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await friendService.sendRequest(alice.id, bob.id);
      const result = await friendService.acceptRequest(alice.id, bob.id);
      expect(result).toEqual({ error: "Cannot accept your own request" });
    });

    it("rejects when no pending request", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const result = await friendService.acceptRequest(bob.id, alice.id);
      expect(result).toEqual({ error: "No pending request found" });
    });
  });

  describe("removeFriendship", () => {
    it("removes an accepted friendship", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);
      const result = await friendService.removeFriendship(alice.id, bob.id);
      expect(result).toEqual({ ok: true });
    });

    it("returns error if no friendship exists", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const result = await friendService.removeFriendship(alice.id, bob.id);
      expect(result).toEqual({ error: "No friendship found" });
    });
  });

  describe("listFriends", () => {
    it("lists accepted friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, bob.id);
      await makeFriends(alice.id, carol.id);

      const result = await friendService.listFriends(alice.id);
      expect(result.total).toBe(2);
      expect(result.friends).toHaveLength(2);
    });

    it("returns empty for user with no friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const result = await friendService.listFriends(alice.id);
      expect(result.total).toBe(0);
      expect(result.friends).toHaveLength(0);
    });

    it("respects pagination", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, bob.id);
      await makeFriends(alice.id, carol.id);

      const result = await friendService.listFriends(alice.id, { limit: 1 });
      expect(result.friends).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe("getMutualFriends", () => {
    it("returns mutual friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, carol.id);
      await makeFriends(bob.id, carol.id);

      const mutuals = await friendService.getMutualFriends(alice.id, bob.id);
      expect(mutuals).toHaveLength(1);
      expect(mutuals[0].handle).toBe("carol");
    });

    it("returns empty when no mutuals", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const mutuals = await friendService.getMutualFriends(alice.id, bob.id);
      expect(mutuals).toHaveLength(0);
    });
  });

  describe("getRelationship", () => {
    it("returns 'none' for strangers", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      expect(await friendService.getRelationship(alice.id, bob.id)).toBe("none");
    });

    it("returns 'accepted' for friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);
      expect(await friendService.getRelationship(alice.id, bob.id)).toBe("accepted");
    });

    it("returns 'pending' for pending requests", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await friendService.sendRequest(alice.id, bob.id);
      expect(await friendService.getRelationship(alice.id, bob.id)).toBe("pending");
    });
  });
});
