import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser } from "../helpers.js";

describe("auth middleware", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("requireAuth", () => {
    it("rejects requests without Authorization header", async () => {
      const res = await request("GET", "/users/me/contacts");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Missing");
    });

    it("rejects requests with invalid token", async () => {
      const res = await request("GET", "/users/me/contacts", { token: "invalid-token" });
      expect(res.status).toBe(401);
    });

    it("rejects requests with Basic auth instead of Bearer", async () => {
      const res = await request("GET", "/users/me/contacts", {
        headers: { Authorization: "Basic dGVzdDp0ZXN0" },
      });
      expect(res.status).toBe(401);
    });

    it("allows requests with valid access token", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/users/me/contacts", { token: user.accessToken });
      expect(res.status).toBe(200);
    });

    it("rejects refresh token used as access token", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("GET", "/users/me/contacts", { token: user.refreshToken });
      expect(res.status).toBe(401);
    });
  });

  describe("optionalAuth", () => {
    it("works without authentication", async () => {
      await createTestUser({ handle: "alice" });
      const res = await request("GET", "/users/alice");
      expect(res.status).toBe(200);
      const body = await res.json();
      // Should not include mutual friend count for unauthenticated
      expect(body.mutualFriendCount).toBeUndefined();
    });

    it("includes extra data when authenticated", async () => {
      const alice = await createTestUser({ handle: "alice" });
      const bob = await createTestUser({ handle: "bob" });
      const res = await request("GET", "/users/alice", { token: bob.accessToken });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mutualFriendCount).toBeDefined();
      expect(body.relationship).toBeDefined();
    });
  });
});
