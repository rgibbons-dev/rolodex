import { Hono } from "hono";
import { db } from "../db/index.js";
import { circles, circleMembers, circleContactGrants, contactLinks, users } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { friendService } from "../services/friends.js";
import type { AppEnv } from "../types.js";

const circlesRouter = new Hono<AppEnv>();

/**
 * POST /users/me/circles — Create a new circle.
 */
circlesRouter.post("/users/me/circles", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const body = await c.req.json<{ name?: string; description?: string }>();

  if (!body.name || typeof body.name !== "string" || body.name.length > 50) {
    return c.json({ error: "Circle name is required and must be at most 50 characters" }, 400);
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 200) {
      return c.json({ error: "Description must be at most 200 characters" }, 400);
    }
  }

  const id = uuid();
  const newCircle = {
    id,
    userId,
    name: body.name,
    description: body.description ?? "",
  };

  await db.insert(circles).values(newCircle);

  return c.json({ circle: newCircle }, 201);
});

/**
 * GET /users/me/circles — List all circles for the authenticated user.
 */
circlesRouter.get("/users/me/circles", requireAuth, async (c) => {
  const userId: string = c.get("userId");

  const userCircles = await db
    .select()
    .from(circles)
    .where(eq(circles.userId, userId))
    .orderBy(circles.createdAt);

  const result = [];
  for (const circle of userCircles) {
    const members = await db
      .select()
      .from(circleMembers)
      .where(eq(circleMembers.circleId, circle.id));

    const grants = await db
      .select()
      .from(circleContactGrants)
      .where(eq(circleContactGrants.circleId, circle.id));

    result.push({
      ...circle,
      memberCount: members.length,
      contactCount: grants.length,
    });
  }

  return c.json({ circles: result });
});

/**
 * GET /users/me/circles/:id — Get circle details with members and contact grants.
 */
circlesRouter.get("/users/me/circles/:id", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const circleId = c.req.param("id");

  const rows = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return c.json({ error: "Circle not found" }, 404);
  }

  const circle = rows[0];

  // Get members with user details
  const memberRows = await db
    .select()
    .from(circleMembers)
    .where(eq(circleMembers.circleId, circleId));

  let members: Array<{ id: string; handle: string; displayName: string; avatarUrl: string | null }> = [];
  if (memberRows.length > 0) {
    const memberIds = memberRows.map((m) => m.friendId);
    members = await db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(memberIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  // Get contact grants
  const grantRows = await db
    .select()
    .from(circleContactGrants)
    .where(eq(circleContactGrants.circleId, circleId));

  let contacts: Array<{ id: string; type: string; label: string; value: string }> = [];
  if (grantRows.length > 0) {
    const contactIds = grantRows.map((g) => g.contactLinkId);
    contacts = await db
      .select({
        id: contactLinks.id,
        type: contactLinks.type,
        label: contactLinks.label,
        value: contactLinks.value,
      })
      .from(contactLinks)
      .where(sql`${contactLinks.id} IN (${sql.join(contactIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  return c.json({
    circle: {
      ...circle,
      members,
      contacts,
    },
  });
});

/**
 * PATCH /users/me/circles/:id — Update a circle.
 */
circlesRouter.patch("/users/me/circles/:id", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const circleId = c.req.param("id");
  const body = await c.req.json<{ name?: string; description?: string }>();

  const rows = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return c.json({ error: "Circle not found" }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.length > 50) {
      return c.json({ error: "Name must be at most 50 characters" }, 400);
    }
    updates.name = body.name;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 200) {
      return c.json({ error: "Description must be at most 200 characters" }, 400);
    }
    updates.description = body.description;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  await db.update(circles).set(updates).where(eq(circles.id, circleId));

  const updated = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  return c.json({ circle: updated[0] });
});

/**
 * DELETE /users/me/circles/:id — Delete a circle.
 */
circlesRouter.delete("/users/me/circles/:id", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const circleId = c.req.param("id");

  const rows = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return c.json({ error: "Circle not found" }, 404);
  }

  await db.delete(circles).where(eq(circles.id, circleId));

  return c.json({ ok: true });
});

/**
 * PUT /users/me/circles/:id/members — Set members of a circle.
 * Only accepted friends can be added.
 */
circlesRouter.put("/users/me/circles/:id/members", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const circleId = c.req.param("id");
  const body = await c.req.json<{ memberIds: string[] }>();

  // Verify circle ownership
  const rows = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return c.json({ error: "Circle not found" }, 404);
  }

  if (!Array.isArray(body.memberIds)) {
    return c.json({ error: "memberIds must be an array" }, 400);
  }

  // Verify all members are friends
  for (const memberId of body.memberIds) {
    const rel = await friendService.getRelationship(userId, memberId);
    if (rel !== "accepted") {
      return c.json({ error: `User ${memberId} is not an accepted friend` }, 400);
    }
  }

  // Replace members
  await db.delete(circleMembers).where(eq(circleMembers.circleId, circleId));

  if (body.memberIds.length > 0) {
    await db.insert(circleMembers).values(
      body.memberIds.map((friendId) => ({
        circleId,
        friendId,
      }))
    );
  }

  // Return member details
  let members: Array<{ id: string; handle: string; displayName: string }> = [];
  if (body.memberIds.length > 0) {
    members = await db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(body.memberIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  return c.json({ members });
});

/**
 * PUT /users/me/circles/:id/contacts — Set contact grants for a circle.
 * Only the user's own contact links can be granted.
 */
circlesRouter.put("/users/me/circles/:id/contacts", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const circleId = c.req.param("id");
  const body = await c.req.json<{ contactIds: string[] }>();

  // Verify circle ownership
  const rows = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return c.json({ error: "Circle not found" }, 404);
  }

  if (!Array.isArray(body.contactIds)) {
    return c.json({ error: "contactIds must be an array" }, 400);
  }

  // Verify all contacts belong to this user
  for (const contactId of body.contactIds) {
    const link = await db
      .select()
      .from(contactLinks)
      .where(eq(contactLinks.id, contactId))
      .limit(1);
    if (link.length === 0 || link[0].userId !== userId) {
      return c.json({ error: `Contact ${contactId} not found or not owned by you` }, 400);
    }
  }

  // Replace grants
  await db.delete(circleContactGrants).where(eq(circleContactGrants.circleId, circleId));

  if (body.contactIds.length > 0) {
    await db.insert(circleContactGrants).values(
      body.contactIds.map((contactLinkId) => ({
        circleId,
        contactLinkId,
      }))
    );
  }

  // Return granted contacts
  let contacts: Array<{ id: string; type: string; label: string; value: string }> = [];
  if (body.contactIds.length > 0) {
    contacts = await db
      .select({
        id: contactLinks.id,
        type: contactLinks.type,
        label: contactLinks.label,
        value: contactLinks.value,
      })
      .from(contactLinks)
      .where(sql`${contactLinks.id} IN (${sql.join(body.contactIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  return c.json({ contacts });
});

export default circlesRouter;
