import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users, magicLinks } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { email } from "./email.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
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

function signToken(payload: Omit<JwtPayload, "type">, type: "access" | "refresh"): string {
  return jwt.sign(
    { ...payload, type },
    JWT_SECRET,
    { expiresIn: type === "access" ? JWT_EXPIRES_IN : REFRESH_EXPIRES_IN }
  );
}

export const authService = {
  generateTokens(userId: string, handle: string): TokenPair {
    return {
      accessToken: signToken({ sub: userId, handle }, "access"),
      refreshToken: signToken({ sub: userId, handle }, "refresh"),
    };
  },

  verifyToken(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      return null;
    }
  },

  async refreshTokens(refreshToken: string): Promise<TokenPair | null> {
    const payload = this.verifyToken(refreshToken);
    if (!payload || payload.type !== "refresh") return null;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (user.length === 0) return null;

    return this.generateTokens(user[0].id, user[0].handle);
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
