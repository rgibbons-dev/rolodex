import { describe, it, expect, beforeEach } from "vitest";
import { canViewContactLink, filterContactLinks } from "../../src/services/visibility.js";
import { cleanDB, createTestUser, makeFriends } from "../helpers.js";
import { db } from "../../src/db/index.js";
import { contactLinks, circles, circleMembers, circleContactGrants } from "../../src/db/schema.js";
import { v4 as uuid } from "uuid";

describe("circle-based contact visibility", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("sharedByDefault=true (default behavior)", () => {
    it("friends_only link with sharedByDefault=true is visible to all friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const result = await canViewContactLink("friends_only", alice.id, bob.id, true);
      expect(result).toBe(true);
    });

    it("friends_only link with sharedByDefault=true is hidden from non-friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });

      const result = await canViewContactLink("friends_only", alice.id, bob.id, true);
      expect(result).toBe(false);
    });
  });

  describe("sharedByDefault=false (opt-in via circles)", () => {
    it("friends_only link with sharedByDefault=false is hidden from friends NOT in a circle", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      // Create a contact link with sharedByDefault=false
      const linkId = uuid();
      await db.insert(contactLinks).values({
        id: linkId,
        userId: alice.id,
        type: "phone",
        label: "Secret Phone",
        value: "+1234567890",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      const result = await canViewContactLink("friends_only", alice.id, bob.id, false, linkId);
      expect(result).toBe(false);
    });

    it("friends_only link with sharedByDefault=false IS visible to friends in a circle with access", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      // Create a contact link with sharedByDefault=false
      const linkId = uuid();
      await db.insert(contactLinks).values({
        id: linkId,
        userId: alice.id,
        type: "phone",
        label: "Secret Phone",
        value: "+1234567890",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      // Create circle, add bob, grant access to this contact
      const circleId = uuid();
      await db.insert(circles).values({
        id: circleId,
        userId: alice.id,
        name: "Inner Circle",
      });
      await db.insert(circleMembers).values({
        circleId,
        friendId: bob.id,
      });
      await db.insert(circleContactGrants).values({
        circleId,
        contactLinkId: linkId,
      });

      const result = await canViewContactLink("friends_only", alice.id, bob.id, false, linkId);
      expect(result).toBe(true);
    });

    it("friend in circle WITHOUT contact grant still cannot see opt-in link", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const linkId = uuid();
      await db.insert(contactLinks).values({
        id: linkId,
        userId: alice.id,
        type: "phone",
        label: "Secret Phone",
        value: "+1234567890",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      // Create circle with bob but NO contact grant for this link
      const circleId = uuid();
      await db.insert(circles).values({
        id: circleId,
        userId: alice.id,
        name: "Inner Circle",
      });
      await db.insert(circleMembers).values({
        circleId,
        friendId: bob.id,
      });

      const result = await canViewContactLink("friends_only", alice.id, bob.id, false, linkId);
      expect(result).toBe(false);
    });

    it("works across multiple circles — union of access", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const linkId = uuid();
      await db.insert(contactLinks).values({
        id: linkId,
        userId: alice.id,
        type: "phone",
        label: "Phone",
        value: "+1234567890",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      // Circle 1: bob is a member but no contact grant
      const circle1Id = uuid();
      await db.insert(circles).values({ id: circle1Id, userId: alice.id, name: "Circle 1" });
      await db.insert(circleMembers).values({ circleId: circle1Id, friendId: bob.id });

      // Circle 2: bob is a member WITH contact grant
      const circle2Id = uuid();
      await db.insert(circles).values({ id: circle2Id, userId: alice.id, name: "Circle 2" });
      await db.insert(circleMembers).values({ circleId: circle2Id, friendId: bob.id });
      await db.insert(circleContactGrants).values({ circleId: circle2Id, contactLinkId: linkId });

      const result = await canViewContactLink("friends_only", alice.id, bob.id, false, linkId);
      expect(result).toBe(true);
    });

    it("owner always sees their own opt-in links", async () => {
      const alice = await createTestUser({ handle: "alice" });

      const linkId = uuid();
      await db.insert(contactLinks).values({
        id: linkId,
        userId: alice.id,
        type: "phone",
        label: "Secret Phone",
        value: "+1234567890",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      const result = await canViewContactLink("friends_only", alice.id, alice.id, false, linkId);
      expect(result).toBe(true);
    });

    it("'everyone' visibility still works regardless of sharedByDefault", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });

      const result = await canViewContactLink("everyone", alice.id, bob.id, false);
      expect(result).toBe(true);
    });
  });

  describe("filterContactLinks with sharedByDefault", () => {
    it("filters opt-in contacts from friends not in a circle", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const publicLinkId = uuid();
      const optInLinkId = uuid();

      await db.insert(contactLinks).values([
        {
          id: publicLinkId,
          userId: alice.id,
          type: "email",
          label: "Email",
          value: "alice@public.com",
          visibility: "friends_only",
          sharedByDefault: true,
        },
        {
          id: optInLinkId,
          userId: alice.id,
          type: "phone",
          label: "Phone",
          value: "+1234567890",
          visibility: "friends_only",
          sharedByDefault: false,
        },
      ]);

      const links = [
        { id: publicLinkId, visibility: "friends_only" as const, sharedByDefault: true },
        { id: optInLinkId, visibility: "friends_only" as const, sharedByDefault: false },
      ];

      const visible = await filterContactLinks(links, alice.id, bob.id);
      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe(publicLinkId);
    });

    it("shows opt-in contacts to friends in a circle with access", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const optInLinkId = uuid();
      await db.insert(contactLinks).values({
        id: optInLinkId,
        userId: alice.id,
        type: "phone",
        label: "Phone",
        value: "+1234567890",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      // Set up circle access
      const circleId = uuid();
      await db.insert(circles).values({ id: circleId, userId: alice.id, name: "Close Friends" });
      await db.insert(circleMembers).values({ circleId, friendId: bob.id });
      await db.insert(circleContactGrants).values({ circleId, contactLinkId: optInLinkId });

      const links = [
        { id: optInLinkId, visibility: "friends_only" as const, sharedByDefault: false },
      ];

      const visible = await filterContactLinks(links, alice.id, bob.id);
      expect(visible).toHaveLength(1);
    });
  });

  describe("profile endpoint respects sharedByDefault", () => {
    it("hides opt-in contacts from friends without circle access", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      await db.insert(contactLinks).values([
        {
          id: uuid(),
          userId: alice.id,
          type: "email",
          label: "Email",
          value: "alice@public.com",
          visibility: "friends_only",
          sharedByDefault: true,
          sortOrder: 0,
        },
        {
          id: uuid(),
          userId: alice.id,
          type: "phone",
          label: "Secret Phone",
          value: "+1234567890",
          visibility: "friends_only",
          sharedByDefault: false,
          sortOrder: 1,
        },
      ]);

      // Import request to test the API endpoint
      const { request } = await import("../helpers.js");
      const res = await request("GET", "/users/alice", { token: bob.accessToken });
      const body = await res.json();
      expect(body.contactLinks).toHaveLength(1);
      expect(body.contactLinks[0].label).toBe("Email");
    });

    it("shows opt-in contacts to friends with circle access", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const optInLinkId = uuid();
      await db.insert(contactLinks).values([
        {
          id: uuid(),
          userId: alice.id,
          type: "email",
          label: "Email",
          value: "alice@public.com",
          visibility: "friends_only",
          sharedByDefault: true,
          sortOrder: 0,
        },
        {
          id: optInLinkId,
          userId: alice.id,
          type: "phone",
          label: "Secret Phone",
          value: "+1234567890",
          visibility: "friends_only",
          sharedByDefault: false,
          sortOrder: 1,
        },
      ]);

      // Create circle with access
      const circleId = uuid();
      await db.insert(circles).values({ id: circleId, userId: alice.id, name: "Inner Circle" });
      await db.insert(circleMembers).values({ circleId, friendId: bob.id });
      await db.insert(circleContactGrants).values({ circleId, contactLinkId: optInLinkId });

      const { request } = await import("../helpers.js");
      const res = await request("GET", "/users/alice", { token: bob.accessToken });
      const body = await res.json();
      expect(body.contactLinks).toHaveLength(2);
    });
  });
});
