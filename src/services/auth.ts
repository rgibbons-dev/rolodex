import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users, magicLinks, refreshTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { email } from "./email.js";

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
})();
const JWT_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";
const MAGIC_LINK_TTL_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string; // user ID
  handle: string;
  type: "access" | "refresh";
}

function signToken(
  payload: Omit<JwtPayload, "type"> & { jti?: string },
  type: "access" | "refresh"
): string {
  return jwt.sign(
    { ...payload, type },
    JWT_SECRET,
    { expiresIn: type === "access" ? JWT_EXPIRES_IN : REFRESH_EXPIRES_IN }
  );
}

export const authService = {
  async generateTokens(userId: string, handle: string): Promise<TokenPair> {
    // Create a DB-backed refresh token
    const refreshId = uuid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.insert(refreshTokens).values({
      id: refreshId,
      userId,
      expiresAt,
    });

    return {
      accessToken: signToken({ sub: userId, handle }, "access"),
      refreshToken: signToken({ sub: userId, handle, jti: refreshId }, "refresh"),
    };
  },

  verifyToken(token: string): (JwtPayload & { jti?: string }) | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JwtPayload & { jti?: string };
    } catch {
      return null;
    }
  },

  async refreshTokens(refreshToken: string): Promise<TokenPair | null> {
    const payload = this.verifyToken(refreshToken);
    if (!payload || payload.type !== "refresh") return null;

    // Validate refresh token exists in DB (not revoked)
    if (payload.jti) {
      const stored = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.id, payload.jti))
        .limit(1);
      if (stored.length === 0) return null;

      // Revoke the old refresh token (rotate)
      await db.delete(refreshTokens).where(eq(refreshTokens.id, payload.jti));
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (user.length === 0) return null;

    return this.generateTokens(user[0].id, user[0].handle);
  },

  async revokeUserTokens(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  },

  async createMagicLink(emailAddress: string): Promise<string> {
    const token = uuid();
    const expiresAt = new Date(
      Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000
    ).toISOString();

    await db.insert(magicLinks).values({
      id: uuid(),
      email: emailAddress,
      token,
      expiresAt,
    });

    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    const link = `${baseUrl}/auth/magic-link/verify?token=${token}`;

    await email.send({
      to: emailAddress,
      subject: "Your Rolodex login link",
      text: `Click here to log in: ${link}\n\nThis link expires in ${MAGIC_LINK_TTL_MINUTES} minutes.`,
    });

    return token;
  },

  async verifyMagicLink(token: string): Promise<{ userId: string; handle: string } | null> {
    const rows = await db
      .select()
      .from(magicLinks)
      .where(eq(magicLinks.token, token))
      .limit(1);

    if (rows.length === 0) return null;
    const link = rows[0];

    if (link.used) return null;
    if (new Date(link.expiresAt) < new Date()) return null;

    // Mark as used
    await db
      .update(magicLinks)
      .set({ used: true })
      .where(eq(magicLinks.id, link.id));

    // Find or create user
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, link.email))
      .limit(1);

    if (user.length === 0) {
      // Auto-create user with email-based handle
      const handle = link.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_");
      const id = uuid();
      await db.insert(users).values({
        id,
        handle,
        email: link.email,
        displayName: handle,
      });
      return { userId: id, handle };
    }

    return { userId: user[0].id, handle: user[0].handle };
  },

  async register(params: {
    handle: string;
    email: string;
    displayName: string;
  }): Promise<{ userId: string } | { error: string }> {
    // Check handle uniqueness
    const existingHandle = await db
      .select()
      .from(users)
      .where(eq(users.handle, params.handle))
      .limit(1);
    if (existingHandle.length > 0) {
      return { error: "Handle already taken" };
    }

    // Check email uniqueness
    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, params.email))
      .limit(1);
    if (existingEmail.length > 0) {
      return { error: "Email already registered" };
    }

    const id = uuid();
    await db.insert(users).values({
      id,
      handle: params.handle,
      email: params.email,
      displayName: params.displayName,
    });

    return { userId: id };
  },
};
