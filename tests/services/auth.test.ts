import { describe, it, expect, beforeEach } from "vitest";
import { authService } from "../../src/services/auth.js";
import { cleanDB, createTestUser } from "../helpers.js";

describe("auth service", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("register", () => {
    it("creates a new user and returns userId", async () => {
      const result = await authService.register({
        handle: "alice",
        email: "alice@test.com",
        displayName: "Alice",
      });
      expect(result).toHaveProperty("userId");
      expect("error" in result).toBe(false);
    });

    it("rejects duplicate handle", async () => {
      await authService.register({ handle: "alice", email: "alice@test.com", displayName: "Alice" });
      const result = await authService.register({ handle: "alice", email: "alice2@test.com", displayName: "Alice 2" });
      expect(result).toEqual({ error: "Handle already taken" });
    });

    it("rejects duplicate email", async () => {
      await authService.register({ handle: "alice", email: "alice@test.com", displayName: "Alice" });
      const result = await authService.register({ handle: "alice2", email: "alice@test.com", displayName: "Alice 2" });
      expect(result).toEqual({ error: "Email already registered" });
    });
  });

  describe("generateTokens", () => {
    it("returns accessToken and refreshToken", async () => {
      const user = await createTestUser();
      const tokens = await authService.generateTokens(user.id, user.handle);
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
    });

    it("generates valid access tokens", async () => {
      const user = await createTestUser();
      const tokens = await authService.generateTokens(user.id, user.handle);
      const payload = authService.verifyToken(tokens.accessToken);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(user.id);
      expect(payload!.handle).toBe(user.handle);
      expect(payload!.type).toBe("access");
    });

    it("generates valid refresh tokens with jti", async () => {
      const user = await createTestUser();
      const tokens = await authService.generateTokens(user.id, user.handle);
      const payload = authService.verifyToken(tokens.refreshToken);
      expect(payload).not.toBeNull();
      expect(payload!.type).toBe("refresh");
      expect(payload!.jti).toBeTruthy();
    });
  });

  describe("verifyToken", () => {
    it("returns null for invalid tokens", () => {
      expect(authService.verifyToken("garbage")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(authService.verifyToken("")).toBeNull();
    });
  });

  describe("refreshTokens", () => {
    it("returns a new token pair from a valid refresh token", async () => {
      const user = await createTestUser();
      const tokens = await authService.generateTokens(user.id, user.handle);
      const newTokens = await authService.refreshTokens(tokens.refreshToken);
      expect(newTokens).not.toBeNull();
      expect(newTokens!.accessToken).toBeTruthy();
      // Refresh token must be different (new jti)
      expect(newTokens!.refreshToken).not.toBe(tokens.refreshToken);
    });

    it("rejects an access token used as refresh", async () => {
      const user = await createTestUser();
      const tokens = await authService.generateTokens(user.id, user.handle);
      const result = await authService.refreshTokens(tokens.accessToken);
      expect(result).toBeNull();
    });

    it("rejects a revoked refresh token (used twice)", async () => {
      const user = await createTestUser();
      const tokens = await authService.generateTokens(user.id, user.handle);
      // First refresh — should succeed
      await authService.refreshTokens(tokens.refreshToken);
      // Second refresh with same token — jti should be revoked
      const result = await authService.refreshTokens(tokens.refreshToken);
      expect(result).toBeNull();
    });

    it("rejects garbage refresh token", async () => {
      const result = await authService.refreshTokens("not-a-token");
      expect(result).toBeNull();
    });
  });

  describe("revokeUserTokens", () => {
    it("revokes all refresh tokens for a user", async () => {
      const user = await createTestUser();
      const tokens = await authService.generateTokens(user.id, user.handle);
      await authService.revokeUserTokens(user.id);
      const result = await authService.refreshTokens(tokens.refreshToken);
      expect(result).toBeNull();
    });
  });

  describe("magic links", () => {
    it("creates and verifies a magic link", async () => {
      // Register a user first
      await authService.register({ handle: "alice", email: "alice@test.com", displayName: "Alice" });
      const token = await authService.createMagicLink("alice@test.com");
      expect(token).toBeTruthy();

      const result = await authService.verifyMagicLink(token);
      expect(result).not.toBeNull();
      expect(result!.handle).toBe("alice");
    });

    it("auto-creates a user for unknown email", async () => {
      const token = await authService.createMagicLink("newuser@test.com");
      const result = await authService.verifyMagicLink(token);
      expect(result).not.toBeNull();
      expect(result!.userId).toBeTruthy();
    });

    it("rejects an already-used magic link", async () => {
      const token = await authService.createMagicLink("alice@test.com");
      await authService.verifyMagicLink(token);
      const result = await authService.verifyMagicLink(token);
      expect(result).toBeNull();
    });

    it("rejects an invalid token", async () => {
      const result = await authService.verifyMagicLink("nonexistent-token");
      expect(result).toBeNull();
    });
  });
});
