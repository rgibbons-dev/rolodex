import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Enums as string unions (SQLite doesn't have native enums) ---

export type ContactLinkType =
  | "phone"
  | "whatsapp"
  | "telegram"
  | "signal"
  | "email"
  | "snapchat"
  | "instagram"
  | "custom";

export type ContactLinkVisibility = "everyone" | "friends_only" | "friends_of_friends";

export type FriendshipStatus = "pending" | "accepted" | "blocked";

// --- Tables ---

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(), // UUID
    handle: text("handle").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio").default(""),
    avatarUrl: text("avatar_url"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    // Settings (Phase 4)
    notifyFriendRequests: integer("notify_friend_requests", { mode: "boolean" })
      .notNull()
      .default(true),
    notifyFriendAccepted: integer("notify_friend_accepted", { mode: "boolean" })
      .notNull()
      .default(true),
  },
  (table) => [
    uniqueIndex("users_handle_idx").on(table.handle),
    uniqueIndex("users_email_idx").on(table.email),
  ]
);

export const contactLinks = sqliteTable(
  "contact_links",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<ContactLinkType>(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    visibility: text("visibility").notNull().$type<ContactLinkVisibility>().default("friends_only"),
    sharedByDefault: integer("shared_by_default", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [index("contact_links_user_idx").on(table.userId)]
);

export const friendships = sqliteTable(
  "friendships",
  {
    // Canonical ordering: userA < userB
    userA: text("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().$type<FriendshipStatus>().default("pending"),
    // Who initiated the request (needed to know who should accept)
    initiatedBy: text("initiated_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("friendships_pair_idx").on(table.userA, table.userB),
    index("friendships_user_a_idx").on(table.userA),
    index("friendships_user_b_idx").on(table.userB),
  ]
);

export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey(), // UUID
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(), // UUID — also the jti claim in the JWT
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("refresh_tokens_user_idx").on(table.userId)]
);

export const circles = sqliteTable(
  "circles",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("circles_user_idx").on(table.userId)]
);

export const circleMembers = sqliteTable(
  "circle_members",
  {
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    friendId: text("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addedAt: text("added_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("circle_members_pair_idx").on(table.circleId, table.friendId),
    index("circle_members_circle_idx").on(table.circleId),
    index("circle_members_friend_idx").on(table.friendId),
  ]
);

export const circleContactGrants = sqliteTable(
  "circle_contact_grants",
  {
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    contactLinkId: text("contact_link_id")
      .notNull()
      .references(() => contactLinks.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("circle_contact_grants_pair_idx").on(table.circleId, table.contactLinkId),
    index("circle_contact_grants_circle_idx").on(table.circleId),
    index("circle_contact_grants_contact_idx").on(table.contactLinkId),
  ]
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "friend_request" | "friend_accepted"
    fromUserId: text("from_user_id").references(() => users.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
  ]
);
