import { Hono } from "hono";
import { db } from "../db/index.js";
import { users, contactLinks, friendships, circles, circleMembers, circleContactGrants } from "../db/schema.js";
import { v4 as uuid } from "uuid";
import { authService } from "../services/auth.js";
import { eq, sql } from "drizzle-orm";

const seed = new Hono();

/**
 * POST /seed — Populate the database with demo data.
 * Returns tokens for the "me" user so the frontend can log in immediately.
 * Idempotent — skips if data already exists.
 */
seed.post("/seed", async (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Seed is disabled in production" }, 403);
  }

  // Check if data already exists
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    // Find the first user and return tokens for them
    const me = await db
      .select()
      .from(users)
      .where(eq(users.handle, "jordanr"))
      .limit(1);
    if (me.length > 0) {
      const tokens = await authService.generateTokens(me[0].id, me[0].handle);
      return c.json({ message: "Already seeded", userId: me[0].id, ...tokens });
    }
    return c.json({ message: "Already seeded" });
  }

  // Create users
  const userDefs = [
    { handle: "jordanr", email: "jordan@hey.com", displayName: "Jordan Rivera", bio: "Design engineer in Brooklyn. Coffee, climbing, open source." },
    { handle: "mikac", email: "mika@gmail.com", displayName: "Mika Chen", bio: "Product designer at Figma. Dog mom. Dim sum enthusiast." },
    { handle: "samokafor", email: "sam@okafor.dev", displayName: "Sam Okafor", bio: "Fullstack dev. Lagos \u2192 NYC. Building things that matter." },
    { handle: "priyash", email: "priya@substack.com", displayName: "Priya Sharma", bio: "Writer & editor. Tea > coffee. Working on my first novel." },
    { handle: "leom", email: "leo@35mm.mx", displayName: "Leo Mart\u00ednez", bio: "Photographer. Analog film only. Mexico City based." },
    { handle: "noorar", email: "noor@proton.me", displayName: "Noor Al-Rashid", bio: "UX researcher. Accessibility advocate. Cat person." },
    { handle: "alexk", email: "alex@startup.io", displayName: "Alex Kim", bio: "Startup founder. Ex-Google. Endlessly optimistic." },
    { handle: "zaraosei", email: "zara@data.co", displayName: "Zara Osei", bio: "Data scientist. Marathon runner. Podcast addict." },
    { handle: "tomasb", email: "tomas@sound.se", displayName: "Tom\u00e1s Bergstr\u00f6m", bio: "Sound designer. Synth collector. Stockholm." },
    { handle: "mayaj", email: "maya@art.com", displayName: "Maya Johnson", bio: "Illustrator & muralist. Big colors, bigger dreams." },
    { handle: "ravip", email: "ravi@spice.com", displayName: "Ravi Patel", bio: "Chef. Cookbook author. Spice is life." },
  ];

  const userIds: Record<string, string> = {};
  for (const u of userDefs) {
    const id = uuid();
    userIds[u.handle] = id;
    await db.insert(users).values({ id, ...u });
  }

  // Contact links for each user
  // sharedByDefault: true (default) = shared with all friends immediately
  // sharedByDefault: false = opt-in only, shared via circles
  const contactDefs: Record<string, Array<{ type: string; label: string; value: string; visibility: string; sharedByDefault?: boolean }>> = {
    jordanr: [
      { type: "phone", label: "Phone", value: "+1 (917) 555-0142", visibility: "friends_only" },
      { type: "whatsapp", label: "WhatsApp", value: "+1 (917) 555-0142", visibility: "friends_only" },
      { type: "telegram", label: "Telegram", value: "@jordanr", visibility: "everyone" },
      { type: "email", label: "Email", value: "jordan@hey.com", visibility: "everyone" },
      { type: "signal", label: "Signal", value: "+1 (917) 555-0142", visibility: "friends_only", sharedByDefault: false },
      { type: "snapchat", label: "Snapchat", value: "@jrivera", visibility: "friends_of_friends" },
    ],
    mikac: [
      { type: "phone", label: "Phone", value: "+1 (415) 555-0198", visibility: "friends_only" },
      { type: "whatsapp", label: "WhatsApp", value: "+1 (415) 555-0198", visibility: "friends_only" },
      { type: "telegram", label: "Telegram", value: "@mikachen", visibility: "everyone" },
      { type: "email", label: "Email", value: "mika@gmail.com", visibility: "everyone" },
      { type: "snapchat", label: "Snapchat", value: "@mikac", visibility: "friends_of_friends" },
    ],
    samokafor: [
      { type: "phone", label: "Phone", value: "+1 (646) 555-0234", visibility: "friends_only" },
      { type: "whatsapp", label: "WhatsApp", value: "+234 802 555 0001", visibility: "friends_only" },
      { type: "email", label: "Email", value: "sam@okafor.dev", visibility: "everyone" },
      { type: "telegram", label: "Telegram", value: "@samokafor", visibility: "everyone" },
    ],
    priyash: [
      { type: "phone", label: "Phone", value: "+91 98765 43210", visibility: "friends_only" },
      { type: "whatsapp", label: "WhatsApp", value: "+91 98765 43210", visibility: "friends_only" },
      { type: "email", label: "Email", value: "priya@substack.com", visibility: "everyone" },
      { type: "signal", label: "Signal", value: "+91 98765 43210", visibility: "friends_only" },
    ],
    leom: [
      { type: "phone", label: "Phone", value: "+52 55 5555 0789", visibility: "friends_only" },
      { type: "whatsapp", label: "WhatsApp", value: "+52 55 5555 0789", visibility: "friends_only" },
      { type: "email", label: "Email", value: "leo@35mm.mx", visibility: "everyone" },
      { type: "instagram", label: "Instagram", value: "@leo.film", visibility: "everyone" },
    ],
    noorar: [
      { type: "email", label: "Email", value: "noor@proton.me", visibility: "everyone" },
      { type: "telegram", label: "Telegram", value: "@noor_ar", visibility: "everyone" },
      { type: "signal", label: "Signal", value: "+1 (312) 555-0456", visibility: "friends_only", sharedByDefault: false },
    ],
    alexk: [
      { type: "email", label: "Email", value: "alex@startup.io", visibility: "everyone" },
      { type: "phone", label: "Phone", value: "+1 (650) 555-0321", visibility: "friends_only" },
    ],
    zaraosei: [
      { type: "email", label: "Email", value: "zara@data.co", visibility: "everyone" },
      { type: "whatsapp", label: "WhatsApp", value: "+44 7700 900123", visibility: "friends_only" },
    ],
    tomasb: [
      { type: "email", label: "Email", value: "tomas@sound.se", visibility: "everyone" },
      { type: "telegram", label: "Telegram", value: "@tomasb_synth", visibility: "everyone" },
    ],
    mayaj: [
      { type: "email", label: "Email", value: "maya@art.com", visibility: "everyone" },
      { type: "snapchat", label: "Snapchat", value: "@mayaj_art", visibility: "friends_of_friends" },
    ],
    ravip: [
      { type: "phone", label: "Phone", value: "+1 (213) 555-0567", visibility: "friends_only" },
      { type: "whatsapp", label: "WhatsApp", value: "+1 (213) 555-0567", visibility: "friends_only" },
    ],
  };

  // Track contact link IDs for circle grants
  const contactLinkIds: Record<string, Record<string, string>> = {};
  for (const [handle, links] of Object.entries(contactDefs)) {
    contactLinkIds[handle] = {};
    for (let i = 0; i < links.length; i++) {
      const id = uuid();
      contactLinkIds[handle][links[i].type + "_" + i] = id;
      await db.insert(contactLinks).values({
        id,
        userId: userIds[handle],
        type: links[i].type as any,
        label: links[i].label,
        value: links[i].value,
        sortOrder: i,
        visibility: links[i].visibility as any,
        sharedByDefault: links[i].sharedByDefault ?? true,
      });
    }
  }

  // Friendships (same graph as alpha mock data)
  // me=jordanr friends: mikac, samokafor, priyash, leom, noorar
  // mikac friends: jordanr, samokafor, priyash, alexk, zaraosei
  // samokafor friends: jordanr, mikac, leom, zaraosei, tomasb
  // priyash friends: jordanr, mikac, alexk, mayaj
  // leom friends: jordanr, samokafor, noorar, tomasb
  // noorar friends: jordanr, leom, mayaj, ravip
  // alexk friends: mikac, priyash, zaraosei
  // zaraosei friends: mikac, samokafor, alexk, ravip
  // tomasb friends: samokafor, leom
  // mayaj friends: priyash, noorar
  // ravip friends: noorar, zaraosei
  const friendPairs: [string, string][] = [
    ["jordanr", "mikac"],
    ["jordanr", "samokafor"],
    ["jordanr", "priyash"],
    ["jordanr", "leom"],
    ["jordanr", "noorar"],
    ["mikac", "samokafor"],
    ["mikac", "priyash"],
    ["mikac", "alexk"],
    ["mikac", "zaraosei"],
    ["samokafor", "leom"],
    ["samokafor", "zaraosei"],
    ["samokafor", "tomasb"],
    ["priyash", "alexk"],
    ["priyash", "mayaj"],
    ["leom", "noorar"],
    ["leom", "tomasb"],
    ["noorar", "mayaj"],
    ["noorar", "ravip"],
    ["alexk", "zaraosei"],
    ["zaraosei", "ravip"],
  ];

  for (const [handleA, handleB] of friendPairs) {
    const idA = userIds[handleA];
    const idB = userIds[handleB];
    const [a, b] = idA < idB ? [idA, idB] : [idB, idA];
    await db.insert(friendships).values({
      userA: a,
      userB: b,
      status: "accepted",
      initiatedBy: idA,
    });
  }

  // Circles — demo access control groups
  // Jordan's "Inner Circle" — mikac and priyash can see Signal
  const jordanInnerCircleId = uuid();
  await db.insert(circles).values({
    id: jordanInnerCircleId,
    userId: userIds["jordanr"],
    name: "Inner Circle",
    description: "My closest friends — they get the private number",
  });
  await db.insert(circleMembers).values([
    { circleId: jordanInnerCircleId, friendId: userIds["mikac"] },
    { circleId: jordanInnerCircleId, friendId: userIds["priyash"] },
  ]);
  // Grant Signal access to Inner Circle
  const jordanSignalId = contactLinkIds["jordanr"]["signal_4"];
  if (jordanSignalId) {
    await db.insert(circleContactGrants).values({
      circleId: jordanInnerCircleId,
      contactLinkId: jordanSignalId,
    });
  }

  // Jordan's "Climbing Crew" — leom and samokafor
  const jordanClimbingId = uuid();
  await db.insert(circles).values({
    id: jordanClimbingId,
    userId: userIds["jordanr"],
    name: "Climbing Crew",
    description: "Weekend bouldering partners",
  });
  await db.insert(circleMembers).values([
    { circleId: jordanClimbingId, friendId: userIds["leom"] },
    { circleId: jordanClimbingId, friendId: userIds["samokafor"] },
  ]);

  // Noor's "Trusted" — jordanr can see Signal
  const noorTrustedId = uuid();
  await db.insert(circles).values({
    id: noorTrustedId,
    userId: userIds["noorar"],
    name: "Trusted",
    description: "People who have my Signal",
  });
  await db.insert(circleMembers).values([
    { circleId: noorTrustedId, friendId: userIds["jordanr"] },
  ]);
  const noorSignalId = contactLinkIds["noorar"]["signal_2"];
  if (noorSignalId) {
    await db.insert(circleContactGrants).values({
      circleId: noorTrustedId,
      contactLinkId: noorSignalId,
    });
  }

  // Return tokens for "jordanr" so the frontend can log in immediately
  const meId = userIds["jordanr"];
  const tokens = await authService.generateTokens(meId, "jordanr");

  return c.json({
    message: "Seeded 11 users with contacts, friendships, and circles",
    userId: meId,
    handle: "jordanr",
    ...tokens,
  }, 201);
});

export default seed;
