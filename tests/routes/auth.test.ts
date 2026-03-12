import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB, createTestUser } from "../helpers.js";

describe("auth routes", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("POST /auth/register", () => {
    it("registers a new user and returns tokens", async () => {
      const res = await request("POST", "/auth/register", {
        body: { handle: "alice", email: "alice@test.com", displayName: "Alice" },
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.userId).toBeTruthy();
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
    });

    it("rejects missing fields", async () => {
      const res = await request("POST", "/auth/register", {
        body: { handle: "alice" },
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid handle format", async () => {
      const res = await request("POST", "/auth/register", {
        body: { handle: "a", email: "a@test.com", displayName: "A" },
      });
      expect(res.status).toBe(400);
    });

    it("rejects handle with special characters", async () => {
      const res = await request("POST", "/auth/register", {
        body: { handle: "al!ce", email: "alice@test.com", displayName: "Alice" },
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid email format", async () => {
      const res = await request("POST", "/auth/register", {
        body: { handle: "alice", email: "not-an-email", displayName: "Alice" },
      });
      expect(res.status).toBe(400);
    });

    it("rejects displayName over 100 characters", async () => {
      const res = await request("POST", "/auth/register", {
        body: { handle: "alice", email: "alice@test.com", displayName: "A".repeat(101) },
      });
      expect(res.status).toBe(400);
    });

    it("rejects duplicate handle with 409", async () => {
      await request("POST", "/auth/register", {
        body: { handle: "alice", email: "alice@test.com", displayName: "Alice" },
      });
      const res = await request("POST", "/auth/register", {
        body: { handle: "alice", email: "alice2@test.com", displayName: "Alice 2" },
      });
      expect(res.status).toBe(409);
    });
  });

  describe("POST /auth/login", () => {
    it("sends a magic link", async () => {
      const res = await request("POST", "/auth/login", {
        body: { email: "alice@test.com" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain("Magic link sent");
    });

    it("rejects missing email", async () => {
      const res = await request("POST", "/auth/login", { body: {} });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /auth/magic-link/verify", () => {
    it("rejects missing token", async () => {
      const res = await request("GET", "/auth/magic-link/verify");
      expect(res.status).toBe(400);
    });

    it("rejects invalid token", async () => {
      const res = await request("GET", "/auth/magic-link/verify?token=invalid");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /auth/refresh", () => {
    it("refreshes a valid refresh token", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/auth/refresh", {
        body: { refreshToken: user.refreshToken },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
    });

    it("rejects an invalid refresh token", async () => {
      const res = await request("POST", "/auth/refresh", {
        body: { refreshToken: "invalid" },
      });
      expect(res.status).toBe(401);
    });

    it("rejects missing refreshToken field", async () => {
      const res = await request("POST", "/auth/refresh", { body: {} });
      expect(res.status).toBe(400);
    });

    it("rejects an access token used as refresh", async () => {
      const user = await createTestUser({ handle: "alice" });
      const res = await request("POST", "/auth/refresh", {
        body: { refreshToken: user.accessToken },
      });
      expect(res.status).toBe(401);
    });
  });
});
