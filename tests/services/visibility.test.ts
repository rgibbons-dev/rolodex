import { describe, it, expect, beforeEach } from "vitest";
import { canViewContactLink, filterContactLinks } from "../../src/services/visibility.js";
import { cleanDB, createTestUser, makeFriends } from "../helpers.js";

describe("visibility service", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("canViewContactLink", () => {
    it("owner can always see their own links", async () => {
      const alice = await createTestUser({ handle: "alice" });
      expect(await canViewContactLink("friends_only", alice.id, alice.id)).toBe(true);
    });

    it("'everyone' visibility is always visible", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      expect(await canViewContactLink("everyone", alice.id, bob.id)).toBe(true);
    });

    it("'everyone' is visible to unauthenticated users", async () => {
      const alice = await createTestUser({ handle: "alice" });
      expect(await canViewContactLink("everyone", alice.id, null)).toBe(true);
    });

    it("'friends_only' is visible to friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);
      expect(await canViewContactLink("friends_only", alice.id, bob.id)).toBe(true);
    });

    it("'friends_only' is hidden from non-friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      expect(await canViewContactLink("friends_only", alice.id, bob.id)).toBe(false);
    });

    it("'friends_only' is hidden from unauthenticated users", async () => {
      const alice = await createTestUser({ handle: "alice" });
      expect(await canViewContactLink("friends_only", alice.id, null)).toBe(false);
    });

    it("'friends_of_friends' is visible to direct friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);
      expect(await canViewContactLink("friends_of_friends", alice.id, bob.id)).toBe(true);
    });

    it("'friends_of_friends' is visible to users with mutual friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, carol.id);
      await makeFriends(bob.id, carol.id);
      expect(await canViewContactLink("friends_of_friends", alice.id, bob.id)).toBe(true);
    });

    it("'friends_of_friends' is hidden from strangers with no mutuals", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      expect(await canViewContactLink("friends_of_friends", alice.id, bob.id)).toBe(false);
    });
  });

  describe("filterContactLinks", () => {
    it("filters links based on visibility", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });

      const links = [
        { id: "1", visibility: "everyone" as const },
        { id: "2", visibility: "friends_only" as const },
        { id: "3", visibility: "friends_of_friends" as const },
      ];

      // Bob is not Alice's friend — should only see "everyone"
      const visible = await filterContactLinks(links, alice.id, bob.id);
      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe("1");
    });

    it("shows all links to the owner", async () => {
      const alice = await createTestUser({ handle: "alice" });

      const links = [
        { id: "1", visibility: "everyone" as const },
        { id: "2", visibility: "friends_only" as const },
        { id: "3", visibility: "friends_of_friends" as const },
      ];

      const visible = await filterContactLinks(links, alice.id, alice.id);
      expect(visible).toHaveLength(3);
    });

    it("shows friends_only links to friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const links = [
        { id: "1", visibility: "everyone" as const },
        { id: "2", visibility: "friends_only" as const },
      ];

      const visible = await filterContactLinks(links, alice.id, bob.id);
      expect(visible).toHaveLength(2);
    });
  });
});
