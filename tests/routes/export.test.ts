import { describe, it, expect, beforeEach } from "vitest";
import { app, cleanDB, createTestUser, makeFriends } from "../helpers.js";
import { db } from "../../src/db/index.js";
import { contactLinks, circles, circleMembers, circleContactGrants } from "../../src/db/schema.js";
import { v4 as uuid } from "uuid";

function request(method: string, path: string, options: {
  token?: string;
  body?: unknown;
  formData?: FormData;
} = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const init: RequestInit = { method, headers };

  if (options.formData) {
    init.body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  return app.request(path, init);
}

describe("export routes", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("GET /export/vcf", () => {
    it("requires authentication", async () => {
      const res = await request("GET", "/export/vcf");
      expect(res.status).toBe(401);
    });

    it("returns 404 when no friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/export/vcf", { token: alice.accessToken });
      expect(res.status).toBe(404);
    });

    it("exports friends as vCard", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob", displayName: "Bob Jones" });
      await makeFriends(alice.id, bob.id);

      // Add a public contact link for Bob
      await db.insert(contactLinks).values({
        id: uuid(),
        userId: bob.id,
        type: "email",
        label: "Work",
        value: "bob@work.com",
        visibility: "everyone",
      });

      const res = await request("GET", "/export/vcf", { token: alice.accessToken });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/vcard");
      const text = await res.text();
      expect(text).toContain("BEGIN:VCARD");
      expect(text).toContain("FN:Bob Jones");
      expect(text).toContain("EMAIL");
    });

    it("excludes opt-in contacts from VCF when viewer lacks circle access", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob", displayName: "Bob" });
      await makeFriends(alice.id, bob.id);

      // Bob has a public contact and an opt-in contact
      await db.insert(contactLinks).values({
        id: uuid(),
        userId: bob.id,
        type: "email",
        label: "Email",
        value: "bob@public.com",
        visibility: "friends_only",
        sharedByDefault: true,
      });
      const optInId = uuid();
      await db.insert(contactLinks).values({
        id: optInId,
        userId: bob.id,
        type: "phone",
        label: "Secret Phone",
        value: "+9999999999",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      const res = await request("GET", "/export/vcf", { token: alice.accessToken });
      const text = await res.text();
      expect(text).toContain("bob@public.com");
      expect(text).not.toContain("+9999999999");
    });

    it("includes opt-in contacts in VCF when viewer has circle access", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob", displayName: "Bob" });
      await makeFriends(alice.id, bob.id);

      const optInId = uuid();
      await db.insert(contactLinks).values({
        id: optInId,
        userId: bob.id,
        type: "phone",
        label: "Phone",
        value: "+9999999999",
        visibility: "friends_only",
        sharedByDefault: false,
      });

      // Bob creates a circle granting alice access
      const circleId = uuid();
      await db.insert(circles).values({ id: circleId, userId: bob.id, name: "Close" });
      await db.insert(circleMembers).values({ circleId, friendId: alice.id });
      await db.insert(circleContactGrants).values({ circleId, contactLinkId: optInId });

      const res = await request("GET", "/export/vcf", { token: alice.accessToken });
      const text = await res.text();
      expect(text).toContain("+9999999999");
    });
  });

  describe("GET /export/csv", () => {
    it("requires authentication", async () => {
      const res = await request("GET", "/export/csv");
      expect(res.status).toBe(401);
    });

    it("returns 404 when no friends", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/export/csv", { token: alice.accessToken });
      expect(res.status).toBe(404);
    });

    it("exports friends as CSV", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob", displayName: "Bob" });
      await makeFriends(alice.id, bob.id);

      await db.insert(contactLinks).values({
        id: uuid(),
        userId: bob.id,
        type: "email",
        label: "Work",
        value: "bob@work.com",
        visibility: "everyone",
      });

      const res = await request("GET", "/export/csv", { token: alice.accessToken });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      const text = await res.text();
      expect(text).toContain("Display Name,Handle,Type,Label,Value");
      expect(text).toContain("Bob");
    });
  });

  describe("POST /import/csv", () => {
    it("requires authentication", async () => {
      const formData = new FormData();
      formData.append("file", new Blob(["data"]), "contacts.csv");
      const res = await request("POST", "/import/csv", { formData });
      expect(res.status).toBe(401);
    });

    it("requires file field", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const formData = new FormData();
      const res = await request("POST", "/import/csv", { token: alice.accessToken, formData });
      expect(res.status).toBe(400);
    });

    it("parses and matches CSV contacts", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob", displayName: "Bob" });

      const csvContent = "Display Name,Handle,Type,Label,Value\r\nBob,bob,email,Work,bob@work.com\r\nUnknown,unknown,phone,Mobile,555";
      const formData = new FormData();
      formData.append("file", new Blob([csvContent], { type: "text/csv" }), "contacts.csv");

      const res = await request("POST", "/import/csv", { token: alice.accessToken, formData });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.matched.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("POST /import/vcf", () => {
    it("requires authentication", async () => {
      const formData = new FormData();
      formData.append("file", new Blob(["data"]), "contacts.vcf");
      const res = await request("POST", "/import/vcf", { formData });
      expect(res.status).toBe(401);
    });

    it("requires file field", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const formData = new FormData();
      const res = await request("POST", "/import/vcf", { token: alice.accessToken, formData });
      expect(res.status).toBe(400);
    });

    it("parses and matches vCard contacts", async () => {
      const alice = await createTestUser({ handle: "alice" });
      await createTestUser({ handle: "bob", displayName: "Bob" });

      const vcfContent = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bob\r\nEND:VCARD";
      const formData = new FormData();
      formData.append("file", new Blob([vcfContent], { type: "text/vcard" }), "contacts.vcf");

      const res = await request("POST", "/import/vcf", { token: alice.accessToken, formData });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
      expect(body.matched).toHaveLength(1);
    });
  });
});
