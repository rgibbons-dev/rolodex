import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser, makeFriends } from "../helpers.js";
import { db } from "../../src/db/index.js";
import { contactLinks } from "../../src/db/schema.js";
import { v4 as uuid } from "uuid";

describe("profile routes", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("GET /users/:handle", () => {
    it("returns a user profile", async () => {
      const alice = await createTestUser({ handle: "alice", displayName: "Alice" });
      const res = await request("GET", "/users/alice");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.handle).toBe("alice");
      expect(body.displayName).toBe("Alice");
    });

    it("returns 404 for unknown handle", async () => {
      const res = await request("GET", "/users/nobody");
      expect(res.status).toBe(404);
    });

    it("includes mutual friend count when authenticated", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, carol.id);
      await makeFriends(bob.id, carol.id);

      const res = await request("GET", "/users/alice", { token: bob.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mutualFriendCount).toBe(1);
      expect(body.relationship).toBeDefined();
    });

    it("filters contact links by visibility for non-friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });

      // Add a friends_only contact link
      await db.insert(contactLinks).values({
        id: uuid(),
        userId: alice.id,
        type: "phone",
        label: "Mobile",
        value: "+1234567890",
        visibility: "friends_only",
      });
      await db.insert(contactLinks).values({
        id: uuid(),
        userId: alice.id,
        type: "email",
        label: "Public Email",
        value: "alice@public.com",
        visibility: "everyone",
      });

      const res = await request("GET", "/users/alice", { token: bob.accessToken });
      const body = await res.json();
      expect(body.contactLinks).toHaveLength(1);
      expect(body.contactLinks[0].label).toBe("Public Email");
    });

    it("shows all contact links to friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      await db.insert(contactLinks).values({
        id: uuid(),
        userId: alice.id,
        type: "phone",
        label: "Mobile",
        value: "+1234567890",
        visibility: "friends_only",
      });

      const res = await request("GET", "/users/alice", { token: bob.accessToken });
      const body = await res.json();
      expect(body.contactLinks).toHaveLength(1);
      expect(body.contactLinks[0].label).toBe("Mobile");
    });
  });

  describe("PATCH /users/me", () => {
    it("requires authentication", async () => {
      const res = await request("PATCH", "/users/me", {
        body: { displayName: "New Name" },
      });
      expect(res.status).toBe(401);
    });

    it("updates display name", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/users/me", {
        body: { displayName: "Alice Updated" },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe("Alice Updated");
    });

    it("updates bio", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/users/me", {
        body: { bio: "Hello world!" },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bio).toBe("Hello world!");
    });

    it("rejects displayName over 100 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/users/me", {
        body: { displayName: "A".repeat(101) },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects bio over 500 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/users/me", {
        body: { bio: "A".repeat(501) },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects non-boolean isPublic", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/users/me", {
        body: { isPublic: "yes" },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects empty update", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", "/users/me", {
        body: {},
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /users/me/contacts", () => {
    it("requires authentication", async () => {
      const res = await request("GET", "/users/me/contacts");
      expect(res.status).toBe(401);
    });

    it("returns contact links for authenticated user", async () => {
      const user = await createTestUser({ handle: "alice" });
      await db.insert(contactLinks).values({
        id: uuid(),
        userId: user.id,
        type: "email",
        label: "Work",
        value: "alice@work.com",
      });

      const res = await request("GET", "/users/me/contacts", { token: user.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contacts).toHaveLength(1);
    });
  });

  describe("PUT /users/me/contacts", () => {
    it("requires authentication", async () => {
      const res = await request("PUT", "/users/me/contacts", {
        body: { contacts: [] },
      });
      expect(res.status).toBe(401);
    });

    it("replaces contacts", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PUT", "/users/me/contacts", {
        body: {
          contacts: [
            { type: "phone", label: "Mobile", value: "+1234567890" },
            { type: "email", label: "Work", value: "alice@work.com" },
          ],
        },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contacts).toHaveLength(2);
    });

    it("rejects invalid contact type", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PUT", "/users/me/contacts", {
        body: { contacts: [{ type: "invalid", label: "X", value: "Y" }] },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid visibility", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PUT", "/users/me/contacts", {
        body: { contacts: [{ type: "phone", label: "X", value: "Y", visibility: "invalid" }] },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects more than 20 contacts", async () => {
      const user = await createTestUser({ handle: "alice" });
      const contacts = Array.from({ length: 21 }, (_, i) => ({
        type: "phone",
        label: `Phone ${i}`,
        value: `+100000000${i}`,
      }));
      const res = await request("PUT", "/users/me/contacts", {
        body: { contacts },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects label over 50 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PUT", "/users/me/contacts", {
        body: { contacts: [{ type: "phone", label: "A".repeat(51), value: "123" }] },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects value over 200 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PUT", "/users/me/contacts", {
        body: { contacts: [{ type: "phone", label: "Phone", value: "A".repeat(201) }] },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("accepts valid visibility values", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PUT", "/users/me/contacts", {
        body: {
          contacts: [
            { type: "phone", label: "Public", value: "111", visibility: "everyone" },
            { type: "email", label: "Friends", value: "a@b.com", visibility: "friends_only" },
            { type: "email", label: "FoF", value: "c@d.com", visibility: "friends_of_friends" },
          ],
        },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
    });
  });
});
