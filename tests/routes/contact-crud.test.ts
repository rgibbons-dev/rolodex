import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser } from "../helpers.js";
import { db } from "../../src/db/index.js";
import { contactLinks } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

describe("individual contact method CRUD", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("POST /users/me/contacts", () => {
    it("adds a single contact method", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: user.accessToken,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.contact).toBeDefined();
      expect(body.contact.type).toBe("phone");
      expect(body.contact.label).toBe("Mobile");
      expect(body.contact.value).toBe("+1234567890");
      expect(body.contact.id).toBeDefined();
      expect(body.contact.visibility).toBe("friends_only");
      expect(body.contact.sharedByDefault).toBe(true);
    });

    it("allows setting visibility and sharedByDefault", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/contacts", {
        body: {
          type: "email",
          label: "Personal",
          value: "alice@secret.com",
          visibility: "everyone",
          sharedByDefault: false,
        },
        token: user.accessToken,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.contact.visibility).toBe("everyone");
      expect(body.contact.sharedByDefault).toBe(false);
    });

    it("allows duplicate contact types (e.g. two phone numbers)", async () => {
      const user = await createTestUser({ handle: "alice" });
      await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1111111111" },
        token: user.accessToken,
      });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Work", value: "+2222222222" },
        token: user.accessToken,
      });
      expect(res.status).toBe(201);

      // Verify both exist
      const listRes = await request("GET", "/users/me/contacts", {
        token: user.accessToken,
      });
      const listBody = await listRes.json();
      expect(listBody.contacts).toHaveLength(2);
    });

    it("requires authentication", async () => {
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects invalid contact type", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "fax", label: "Fax", value: "+1234567890" },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing label", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", value: "+1234567890" },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects missing value", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile" },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects label over 50 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "A".repeat(51), value: "+1234567890" },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("rejects value over 200 chars", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Phone", value: "A".repeat(201) },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });

    it("enforces max 20 contacts", async () => {
      const user = await createTestUser({ handle: "alice" });
      // Insert 20 contacts directly
      for (let i = 0; i < 20; i++) {
        await db.insert(contactLinks).values({
          id: uuid(),
          userId: user.id,
          type: "phone",
          label: `Phone ${i}`,
          value: `+100000000${i}`,
          sortOrder: i,
        });
      }
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Phone 21", value: "+9999999999" },
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/maximum/i);
    });

    it("auto-assigns sortOrder based on existing contacts", async () => {
      const user = await createTestUser({ handle: "alice" });
      await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Phone 1", value: "+1111111111" },
        token: user.accessToken,
      });
      const res = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Phone 2", value: "+2222222222" },
        token: user.accessToken,
      });
      const body = await res.json();
      expect(body.contact.sortOrder).toBe(1);
    });
  });

  describe("PATCH /users/me/contacts/:id", () => {
    it("updates a contact method", async () => {
      const user = await createTestUser({ handle: "alice" });
      const createRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: user.accessToken,
      });
      const { contact } = await createRes.json();

      const res = await request("PATCH", `/users/me/contacts/${contact.id}`, {
        body: { label: "Work Phone", value: "+0987654321" },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contact.label).toBe("Work Phone");
      expect(body.contact.value).toBe("+0987654321");
      expect(body.contact.type).toBe("phone"); // unchanged
    });

    it("updates visibility", async () => {
      const user = await createTestUser({ handle: "alice" });
      const createRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: user.accessToken,
      });
      const { contact } = await createRes.json();

      const res = await request("PATCH", `/users/me/contacts/${contact.id}`, {
        body: { visibility: "everyone" },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contact.visibility).toBe("everyone");
    });

    it("updates sharedByDefault", async () => {
      const user = await createTestUser({ handle: "alice" });
      const createRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: user.accessToken,
      });
      const { contact } = await createRes.json();

      const res = await request("PATCH", `/users/me/contacts/${contact.id}`, {
        body: { sharedByDefault: false },
        token: user.accessToken,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contact.sharedByDefault).toBe(false);
    });

    it("returns 404 for non-existent contact", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("PATCH", `/users/me/contacts/${uuid()}`, {
        body: { label: "New" },
        token: user.accessToken,
      });
      expect(res.status).toBe(404);
    });

    it("cannot update another user's contact", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const createRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: alice.accessToken,
      });
      const { contact } = await createRes.json();

      const res = await request("PATCH", `/users/me/contacts/${contact.id}`, {
        body: { label: "Hijacked" },
        token: bob.accessToken,
      });
      expect(res.status).toBe(404);
    });

    it("requires authentication", async () => {
      const res = await request("PATCH", `/users/me/contacts/${uuid()}`, {
        body: { label: "New" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects empty update", async () => {
      const user = await createTestUser({ handle: "alice" });
      const createRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: user.accessToken,
      });
      const { contact } = await createRes.json();

      const res = await request("PATCH", `/users/me/contacts/${contact.id}`, {
        body: {},
        token: user.accessToken,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /users/me/contacts/:id", () => {
    it("deletes a contact method", async () => {
      const user = await createTestUser({ handle: "alice" });
      const createRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: user.accessToken,
      });
      const { contact } = await createRes.json();

      const res = await request("DELETE", `/users/me/contacts/${contact.id}`, {
        token: user.accessToken,
      });
      expect(res.status).toBe(200);

      // Verify it's gone
      const listRes = await request("GET", "/users/me/contacts", {
        token: user.accessToken,
      });
      const listBody = await listRes.json();
      expect(listBody.contacts).toHaveLength(0);
    });

    it("returns 404 for non-existent contact", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("DELETE", `/users/me/contacts/${uuid()}`, {
        token: user.accessToken,
      });
      expect(res.status).toBe(404);
    });

    it("cannot delete another user's contact", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const createRes = await request("POST", "/users/me/contacts", {
        body: { type: "phone", label: "Mobile", value: "+1234567890" },
        token: alice.accessToken,
      });
      const { contact } = await createRes.json();

      const res = await request("DELETE", `/users/me/contacts/${contact.id}`, {
        token: bob.accessToken,
      });
      expect(res.status).toBe(404);
    });

    it("requires authentication", async () => {
      const res = await request("DELETE", `/users/me/contacts/${uuid()}`);
      expect(res.status).toBe(401);
    });
  });
});
