import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, contactLinks } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { friendService } from "../services/friends.js";
import { generateVCards, parseVCards } from "../lib/vcard.js";
import { generateCsv, parseCsv } from "../lib/csv.js";
import { filterContactLinks } from "../services/visibility.js";
import type { AppEnv } from "../types.js";

const exportRouter = new Hono<AppEnv>();

/**
 * GET /export/vcf — Download friends as vCard file.
 */
exportRouter.get("/export/vcf", requireAuth, async (c) => {
  const userId: string = c.get("userId");

  const friendIds = await friendService.getAllFriendIds(userId);
  if (friendIds.length === 0) {
    return c.json({ error: "No friends to export" }, 404);
  }

  // Fetch friend users
  const friendUsers = await db
    .select()
    .from(users)
    .where(sql`${users.id} IN (${sql.join(friendIds.map(id => sql`${id}`), sql`, `)})`);

  // For each friend, get their visible contact links
  const vcardContacts = [];
  for (const friend of friendUsers) {
    const links = await db
      .select()
      .from(contactLinks)
      .where(eq(contactLinks.userId, friend.id));

    const visibleLinks = await filterContactLinks(links, friend.id, userId);

    vcardContacts.push({
      displayName: friend.displayName,
      handle: friend.handle,
      contacts: visibleLinks.map((l) => ({
        type: l.type,
        label: l.label,
        value: l.value,
      })),
    });
  }

  const vcf = generateVCards(vcardContacts);

  c.header("Content-Type", "text/vcard; charset=utf-8");
  c.header("Content-Disposition", "attachment; filename=\"rolodex-contacts.vcf\"");
  return c.body(vcf);
});

/**
 * GET /export/csv — Download friends as CSV file.
 */
exportRouter.get("/export/csv", requireAuth, async (c) => {
  const userId: string = c.get("userId");

  const friendIds = await friendService.getAllFriendIds(userId);
  if (friendIds.length === 0) {
    return c.json({ error: "No friends to export" }, 404);
  }

  const friendUsers = await db
    .select()
    .from(users)
    .where(sql`${users.id} IN (${sql.join(friendIds.map(id => sql`${id}`), sql`, `)})`);

  const csvContacts = [];
  for (const friend of friendUsers) {
    const links = await db
      .select()
      .from(contactLinks)
      .where(eq(contactLinks.userId, friend.id));

    const visibleLinks = await filterContactLinks(links, friend.id, userId);

    for (const link of visibleLinks) {
      csvContacts.push({
        displayName: friend.displayName,
        handle: friend.handle,
        type: link.type,
        label: link.label,
        value: link.value,
      });
    }
  }

  const csv = generateCsv(csvContacts);

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", "attachment; filename=\"rolodex-contacts.csv\"");
  return c.body(csv);
});

/**
 * POST /import/vcf — Upload a .vcf file, parse and match against existing users.
 * Body: multipart/form-data with a "file" field.
 */
exportRouter.post("/import/vcf", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "file is required" }, 400);
  }

  const content = await file.text();
  const parsed = parseVCards(content);

  // Try to match parsed contacts against existing users by name
  const matched: Array<{ displayName: string; handle?: string; userId?: string }> = [];
  const unmatched: Array<{ displayName: string }> = [];

  for (const card of parsed) {
    // Search for matching users by display name
    const pattern = `%${card.displayName}%`;
    const found = await db
      .select({ id: users.id, handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(sql`${users.displayName} LIKE ${pattern}`)
      .limit(1);

    if (found.length > 0) {
      matched.push({
        displayName: card.displayName,
        handle: found[0].handle,
        userId: found[0].id,
      });
    } else {
      unmatched.push({ displayName: card.displayName });
    }
  }

  return c.json({
    total: parsed.length,
    matched,
    unmatched,
    message: `Parsed ${parsed.length} contacts. ${matched.length} matched existing users.`,
  });
});

/**
 * POST /import/csv — Upload a .csv file, parse and match against existing users.
 */
exportRouter.post("/import/csv", requireAuth, async (c) => {
  const userId: string = c.get("userId");
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "file is required" }, 400);
  }

  const content = await file.text();
  const parsed = parseCsv(content);

  // Group by display name and try to match
  const byName = new Map<string, typeof parsed>();
  for (const row of parsed) {
    const existing = byName.get(row.displayName) || [];
    existing.push(row);
    byName.set(row.displayName, existing);
  }

  const matched: Array<{ displayName: string; handle?: string; userId?: string }> = [];
  const unmatched: Array<{ displayName: string }> = [];

  for (const [name] of byName) {
    const pattern = `%${name}%`;
    const found = await db
      .select({ id: users.id, handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(sql`${users.displayName} LIKE ${pattern}`)
      .limit(1);

    if (found.length > 0) {
      matched.push({
        displayName: name,
        handle: found[0].handle,
        userId: found[0].id,
      });
    } else {
      unmatched.push({ displayName: name });
    }
  }

  return c.json({
    total: byName.size,
    matched,
    unmatched,
    message: `Parsed ${byName.size} unique contacts. ${matched.length} matched existing users.`,
  });
});

export default exportRouter;
