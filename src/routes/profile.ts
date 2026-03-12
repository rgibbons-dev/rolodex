import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, contactLinks, type ContactLinkType, type ContactLinkVisibility } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { storage } from "../services/storage.js";
import { filterContactLinks } from "../services/visibility.js";
import { friendService } from "../services/friends.js";
import type { AppEnv } from "../types.js";

const profile = new Hono<AppEnv>();

/**
 * GET /users/:handle — Public profile (respects visibility).
 * If authenticated, contact links are filtered based on relationship.
 */
profile.get("/users/:handle", optionalAuth, async (c) => {
  const handle = c.req.param("handle");
  const viewerId: string | undefined = c.get("userId");

  const user = await db
    .select()
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const u = user[0];

  // Get contact links
  const links = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.userId, u.id))
    .orderBy(contactLinks.sortOrder);

  // Filter based on visibility
  const visibleLinks = await filterContactLinks(links, u.id, viewerId ?? null);

  // Get mutual friend count if viewer is authenticated
  let mutualCount = 0;
  let relationship: string = "none";
  if (viewerId && viewerId !== u.id) {
    const mutuals = await friendService.getMutualFriends(u.id, viewerId);
    mutualCount = mutuals.length;
    relationship = await friendService.getRelationship(u.id, viewerId);
  }

  return c.json({
    id: u.id,
    handle: u.handle,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    isPublic: u.isPublic,
    createdAt: u.createdAt,
    contactLinks: visibleLinks.map((l) => ({
      id: l.id,
      type: l.type,
      label: l.label,
      value: l.value,
      sortOrder: l.sortOrder,
    })),
    ...(viewerId ? { mutualFriendCount: mutualCount, relationship } : {}),
  });
});

/**
 * PATCH /users/me — Update profile (name, bio, avatar).
 */
profile.patch("/users/me", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const contentType = c.req.header("Content-Type") || "";

  let displayName: string | undefined;
  let bio: string | undefined;
  let avatarFile: File | null = null;
  let isPublic: boolean | undefined;

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    displayName = formData.get("displayName") as string | undefined;
    bio = formData.get("bio") as string | undefined;
    avatarFile = formData.get("avatar") as File | null;
    const isPublicStr = formData.get("isPublic") as string | undefined;
    if (isPublicStr !== undefined) isPublic = isPublicStr === "true";
  } else {
    const body = await c.req.json();
    displayName = body.displayName;
    bio = body.bio;
    isPublic = body.isPublic;
  }

  // Validate profile field lengths and types
  if (displayName !== undefined) {
    if (typeof displayName !== "string" || displayName.length > 100) {
      return c.json({ error: "displayName must be a string of at most 100 characters" }, 400);
    }
  }
  if (bio !== undefined) {
    if (typeof bio !== "string" || bio.length > 500) {
      return c.json({ error: "bio must be a string of at most 500 characters" }, 400);
    }
  }
  if (isPublic !== undefined && typeof isPublic !== "boolean") {
    return c.json({ error: "isPublic must be a boolean" }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (bio !== undefined) updates.bio = bio;
  if (isPublic !== undefined) updates.isPublic = isPublic;

  // Handle avatar upload
  if (avatarFile) {
    const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
    const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
    const ext = (avatarFile.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return c.json({ error: "Invalid file type. Allowed: jpg, jpeg, png, gif, webp" }, 400);
    }
    if (avatarFile.size > MAX_AVATAR_SIZE) {
      return c.json({ error: "File too large. Maximum size is 5 MB" }, 400);
    }
    const key = `avatars/${userId}.${ext}`;
    const buffer = Buffer.from(await avatarFile.arrayBuffer());
    const url = await storage.upload(key, buffer, avatarFile.type);
    updates.avatarUrl = url;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  const updated = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return c.json({
    id: updated[0].id,
    handle: updated[0].handle,
    displayName: updated[0].displayName,
    bio: updated[0].bio,
    avatarUrl: updated[0].avatarUrl,
    isPublic: updated[0].isPublic,
  });
});

/**
 * GET /users/me/contacts — Full contact list for the authenticated user.
 */
profile.get("/users/me/contacts", requireAuth, async (c) => {
  const userId: string = c.get("userId");

  const links = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.userId, userId))
    .orderBy(contactLinks.sortOrder);

  return c.json({ contacts: links });
});

/**
 * PUT /users/me/contacts — Bulk upsert contact links.
 * Replaces all contact links for the user.
 * Body: { contacts: [{ type, label, value, sortOrder, visibility }] }
 */
profile.put("/users/me/contacts", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const body = await c.req.json<{
    contacts: Array<{
      type: string;
      label: string;
      value: string;
      sortOrder?: number;
      visibility?: string;
      sharedByDefault?: boolean;
    }>;
  }>();

  if (!Array.isArray(body.contacts)) {
    return c.json({ error: "contacts must be an array" }, 400);
  }

  const MAX_CONTACTS = 20;
  if (body.contacts.length > MAX_CONTACTS) {
    return c.json({ error: `Maximum ${MAX_CONTACTS} contact links allowed` }, 400);
  }

  const VALID_TYPES = new Set(["phone", "whatsapp", "telegram", "signal", "email", "snapchat", "instagram", "custom"]);
  const VALID_VISIBILITY = new Set(["everyone", "friends_only", "friends_of_friends"]);

  for (const contact of body.contacts) {
    if (!VALID_TYPES.has(contact.type)) {
      return c.json({ error: `Invalid contact type: ${contact.type}` }, 400);
    }
    if (contact.visibility && !VALID_VISIBILITY.has(contact.visibility)) {
      return c.json({ error: `Invalid visibility: ${contact.visibility}` }, 400);
    }
    if (!contact.label || contact.label.length > 50) {
      return c.json({ error: "Contact label is required and must be at most 50 characters" }, 400);
    }
    if (!contact.value || contact.value.length > 200) {
      return c.json({ error: "Contact value is required and must be at most 200 characters" }, 400);
    }
  }

  // Delete existing links and insert new ones
  await db.delete(contactLinks).where(eq(contactLinks.userId, userId));

  const newLinks = body.contacts.map((contact, i) => ({
    id: uuid(),
    userId,
    type: contact.type as ContactLinkType,
    label: contact.label,
    value: contact.value,
    sortOrder: contact.sortOrder ?? i,
    visibility: (contact.visibility as ContactLinkVisibility) ?? "friends_only",
    sharedByDefault: contact.sharedByDefault ?? true,
  }));

  if (newLinks.length > 0) {
    await db.insert(contactLinks).values(newLinks);
  }

  return c.json({ contacts: newLinks });
});

/**
 * POST /users/me/contacts — Add a single contact method.
 */
profile.post("/users/me/contacts", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const body = await c.req.json<{
    type?: string;
    label?: string;
    value?: string;
    visibility?: string;
    sharedByDefault?: boolean;
    sortOrder?: number;
  }>();

  const VALID_TYPES = new Set(["phone", "whatsapp", "telegram", "signal", "email", "snapchat", "instagram", "custom"]);
  const VALID_VISIBILITY = new Set(["everyone", "friends_only", "friends_of_friends"]);

  if (!body.type || !VALID_TYPES.has(body.type)) {
    return c.json({ error: `Invalid or missing contact type` }, 400);
  }
  if (!body.label || typeof body.label !== "string" || body.label.length > 50) {
    return c.json({ error: "Contact label is required and must be at most 50 characters" }, 400);
  }
  if (!body.value || typeof body.value !== "string" || body.value.length > 200) {
    return c.json({ error: "Contact value is required and must be at most 200 characters" }, 400);
  }
  if (body.visibility && !VALID_VISIBILITY.has(body.visibility)) {
    return c.json({ error: `Invalid visibility: ${body.visibility}` }, 400);
  }

  // Enforce max 20 contacts
  const existing = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.userId, userId));
  if (existing.length >= 20) {
    return c.json({ error: "Maximum 20 contact links allowed" }, 400);
  }

  // Auto-assign sortOrder
  const maxSort = existing.reduce((max, l) => Math.max(max, l.sortOrder), -1);

  const id = uuid();
  const newLink = {
    id,
    userId,
    type: body.type as ContactLinkType,
    label: body.label,
    value: body.value,
    sortOrder: body.sortOrder ?? maxSort + 1,
    visibility: (body.visibility as ContactLinkVisibility) ?? "friends_only",
    sharedByDefault: body.sharedByDefault ?? true,
  };

  await db.insert(contactLinks).values(newLink);

  return c.json({ contact: newLink }, 201);
});

/**
 * PATCH /users/me/contacts/:id — Update a single contact method.
 */
profile.patch("/users/me/contacts/:id", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const contactId = c.req.param("id");
  const body = await c.req.json<{
    label?: string;
    value?: string;
    visibility?: string;
    sharedByDefault?: boolean;
    sortOrder?: number;
  }>();

  const VALID_VISIBILITY = new Set(["everyone", "friends_only", "friends_of_friends"]);

  // Find the contact link owned by this user
  const rows = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.id, contactId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return c.json({ error: "Contact not found" }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) {
    if (typeof body.label !== "string" || body.label.length > 50) {
      return c.json({ error: "Label must be at most 50 characters" }, 400);
    }
    updates.label = body.label;
  }
  if (body.value !== undefined) {
    if (typeof body.value !== "string" || body.value.length > 200) {
      return c.json({ error: "Value must be at most 200 characters" }, 400);
    }
    updates.value = body.value;
  }
  if (body.visibility !== undefined) {
    if (!VALID_VISIBILITY.has(body.visibility)) {
      return c.json({ error: `Invalid visibility: ${body.visibility}` }, 400);
    }
    updates.visibility = body.visibility;
  }
  if (body.sharedByDefault !== undefined) {
    if (typeof body.sharedByDefault !== "boolean") {
      return c.json({ error: "sharedByDefault must be a boolean" }, 400);
    }
    updates.sharedByDefault = body.sharedByDefault;
  }
  if (body.sortOrder !== undefined) {
    updates.sortOrder = body.sortOrder;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  await db.update(contactLinks).set(updates).where(eq(contactLinks.id, contactId));

  const updated = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.id, contactId))
    .limit(1);

  return c.json({ contact: updated[0] });
});

/**
 * DELETE /users/me/contacts/:id — Delete a single contact method.
 */
profile.delete("/users/me/contacts/:id", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const contactId = c.req.param("id");

  const rows = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.id, contactId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return c.json({ error: "Contact not found" }, 404);
  }

  await db.delete(contactLinks).where(eq(contactLinks.id, contactId));

  return c.json({ ok: true });
});

export default profile;
