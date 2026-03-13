import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser, makeFriends } from "../helpers.js";
import { db } from "../../src/db/index.js";
import { contactLinks } from "../../src/db/schema.js";
import { v4 as uuid } from "uuid";

describe("circles", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("POST /users/me/circles", () => {
    it("creates a circle", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.circle.id).toBeDefined();
      expect(body.circle.name).toBe("Inner Circle");
      expect(body.circle.description).toBe("");
    });

    it("creates a circle with description", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/circles", {
        body: { name: "Close Friends", description: "People I trust" },
        token: user.accessToken,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.circle.description).toBe("People I trust");
    });

    it("requires authentication", async () => {
      const res = await request("POST", "/users/me/circles", {
        body: { name: "Test" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects missing name", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/circles", {
        body: {},
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects name over 50 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/circles", {
        body: { name: "A".repeat(51) },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects description over 200 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/circles", {
        body: { name: "Test", description: "A".repeat(201) },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /users/me/circles", () => {
    it("returns empty list initially", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/users/me/circles", {
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.circles).toEqual([]);
    });

    it("returns created circles", async () => {
      const user = await createTestUser({ handle: "alice" });
      await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      await request("POST", "/users/me/circles", {
        body: { name: "Acquaintances" },
        token: user.accessToken,
      });

      const res = await request("GET", "/users/me/circles", {
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.circles).toHaveLength(2);
    });

    it("includes member count and contact grant count", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      // Create circle
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      // Add member
      await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [bob.id] },
        token: alice.accessToken,
      });

      // Add contact link and grant
      const contactRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890", sharedByDefault: false },
        token: alice.accessToken,
      });
      const { contact } = await contactRes.json();
      await request("PUT", `/users/me/circles/${circle.id}/contacts`, {
        body: { contactIds: [contact.id] },
        token: alice.accessToken,
      });

      const res = await request("GET", "/users/me/circles", {
        token: alice.accessToken,
      });
      const body = await res.json();
      expect(body.circles[0].memberCount).toBe(1);
      expect(body.circles[0].contactCount).toBe(1);
    });

    it("requires authentication", async () => {
      const res = await request("GET", "/users/me/circles");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /users/me/circles/:id", () => {
    it("returns circle details with members and contacts", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      // Add member
      await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [bob.id] },
        token: alice.accessToken,
      });

      const res = await request("GET", `/users/me/circles/${circle.id}`, {
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.circle.name).toBe("Inner Circle");
      expect(body.circle.members).toHaveLength(1);
      expect(body.circle.members[0].id).toBe(bob.id);
    });

    it("returns 404 for non-existent circle", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("GET", `/users/me/circles/${uuid()}`, {
        token: user.accessToken,
      });
      expect(res.status).toBe(404);
    });

    it("cannot view another user's circle", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("GET", `/users/me/circles/${circle.id}`, {
        token: bob.accessToken,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /users/me/circles/:id", () => {
    it("updates circle name", async () => {
      const user = await createTestUser({ handle: "alice" });
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("PATCH", `/users/me/circles/${circle.id}`, {
        body: { name: "Close Friends" },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.circle.name).toBe("Close Friends");
    });

    it("updates circle description", async () => {
      const user = await createTestUser({ handle: "alice" });
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("PATCH", `/users/me/circles/${circle.id}`, {
        body: { description: "My closest friends" },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.circle.description).toBe("My closest friends");
    });

    it("returns 404 for non-existent circle", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", `/users/me/circles/${uuid()}`, {
        body: { name: "New" },
        token: user.accessToken,
      });
      expect(res.status).toBe(404);
    });

    it("rejects empty update", async () => {
      const user = await createTestUser({ handle: "alice" });
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("PATCH", `/users/me/circles/${circle.id}`, {
        body: {},
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /users/me/circles/:id", () => {
    it("deletes a circle", async () => {
      const user = await createTestUser({ handle: "alice" });
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("DELETE", `/users/me/circles/${circle.id}`, {
        token: user.accessToken,
      });
      expect(res.status).toBe(200);

      // Verify it's gone
      const listRes = await request("GET", "/users/me/circles", {
        token: user.accessToken,
      });
      const listBody = await listRes.json();
      expect(listBody.circles).toHaveLength(0);
    });

    it("returns 404 for non-existent circle", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("DELETE", `/users/me/circles/${uuid()}`, {
        token: user.accessToken,
      });
      expect(res.status).toBe(404);
    });

    it("cannot delete another user's circle", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("DELETE", `/users/me/circles/${circle.id}`, {
        token: bob.accessToken,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /users/me/circles/:id/members", () => {
    it("sets circle members", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, bob.id);
      await makeFriends(alice.id, carol.id);

      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [bob.id, carol.id] },
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toHaveLength(2);
    });

    it("replaces existing members", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const carol = await createTestUser({ handle: "carol" });
      await makeFriends(alice.id, bob.id);
      await makeFriends(alice.id, carol.id);

      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      // Set bob initially
      await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [bob.id] },
        token: alice.accessToken,
      });

      // Replace with carol only
      const res = await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [carol.id] },
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toHaveLength(1);
      expect(body.members[0].id).toBe(carol.id);
    });

    it("rejects non-friends as members", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      // NOT friends

      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [bob.id] },
        token: alice.accessToken,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/friend/i);
    });

    it("allows a friend to be in multiple circles", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const circle1Res = await request("POST", "/users/me/circles", {
        body: { name: "Close Friends" },
        token: alice.accessToken,
      });
      const { circle: circle1 } = await circle1Res.json();

      const circle2Res = await request("POST", "/users/me/circles", {
        body: { name: "Collaborators" },
        token: alice.accessToken,
      });
      const { circle: circle2 } = await circle2Res.json();

      await request("PUT", `/users/me/circles/${circle1.id}/members`, {
        body: { memberIds: [bob.id] },
        token: alice.accessToken,
      });
      const res = await request("PUT", `/users/me/circles/${circle2.id}/members`, {
        body: { memberIds: [bob.id] },
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);
    });

    it("allows clearing all members", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      await makeFriends(alice.id, bob.id);

      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [bob.id] },
        token: alice.accessToken,
      });

      const res = await request("PUT", `/users/me/circles/${circle.id}/members`, {
        body: { memberIds: [] },
        token: alice.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.members).toHaveLength(0);
    });
  });

  describe("PUT /users/me/circles/:id/contacts", () => {
    it("sets contact grants for a circle", async () => {
      const user = await createTestUser({ handle: "alice" });

      // Create contacts
      const c1 = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Phone", value: "+111", sharedByDefault: false },
        token: user.accessToken,
      });
      const { contact: contact1 } = await c1.json();

      const c2 = await request("POST", "/users/me/contacts", {
        body: { type: "email", label: "Email", value: "a@b.com", sharedByDefault: false },
        token: user.accessToken,
      });
      const { contact: contact2 } = await c2.json();

      // Create circle
      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      const { circle } = await circleRes.json();

      // Grant contact access to circle
      const res = await request("PUT", `/users/me/circles/${circle.id}/contacts`, {
        body: { contactIds: [contact1.id, contact2.id] },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contacts).toHaveLength(2);
    });

    it("rejects contact IDs that belong to another user", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });

      const c1 = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Phone", value: "+111" },
        token: bob.accessToken,
      });
      const { contact } = await c1.json();

      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: alice.accessToken,
      });
      const { circle } = await circleRes.json();

      const res = await request("PUT", `/users/me/circles/${circle.id}/contacts`, {
        body: { contactIds: [contact.id] },
        token: alice.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("replaces existing contact grants", async () => {
      const user = await createTestUser({ handle: "alice" });

      const c1 = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Phone", value: "+111", sharedByDefault: false },
        token: user.accessToken,
      });
      const { contact: contact1 } = await c1.json();
      const c2 = await request("POST", "/users/me/contacts", {
        body: { type: "email", label: "Email", value: "a@b.com", sharedByDefault: false },
        token: user.accessToken,
      });
      const { contact: contact2 } = await c2.json();

      const circleRes = await request("POST", "/users/me/circles", {
        body: { name: "Inner Circle" },
        token: user.accessToken,
      });
      const { circle } = await circleRes.json();

      // First, grant both
      await request("PUT", `/users/me/circles/${circle.id}/contacts`, {
        body: { contactIds: [contact1.id, contact2.id] },
        token: user.accessToken,
      });

      // Then, replace with just one
      const res = await request("PUT", `/users/me/circles/${circle.id}/contacts`, {
        body: { contactIds: [contact1.id] },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contacts).toHaveLength(1);
    });
  });
});
