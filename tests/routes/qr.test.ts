import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser } from "../helpers.js";

describe("QR routes", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("GET /qr/:handle", () => {
    it("returns a PNG for valid user", async () => {
      await createTestUser({ handle: "alice" });
      const res = await request("GET", "/qr/alice");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("content-disposition")).toContain("alice-qr.png");
    });

    it("returns 404 for nonexistent user", async () => {
      const res = await request("GET", "/qr/nobody");
      expect(res.status).toBe(404);
    });

    it("sanitizes handle in Content-Disposition", async () => {
      // The handle validation only allows alphanumeric + underscore,
      // but test that the filename sanitization works
      await createTestUser({ handle: "alice_test" });
      const res = await request("GET", "/qr/alice_test");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain("alice_test-qr.png");
    });
  });

  describe("GET /qr/:handle/data-url", () => {
    it("returns a data URL for valid user", async () => {
      await createTestUser({ handle: "alice" });
      const res = await request("GET", "/qr/alice/data-url");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(body.handle).toBe("alice");
    });

    it("returns 404 for nonexistent user", async () => {
      const res = await request("GET", "/qr/nobody/data-url");
      expect(res.status).toBe(404);
    });
  });
});
