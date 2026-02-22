# Rolodex — Backend Architecture & Build Plan

## Product concept

A social network organized around *contact information* rather than content. Users create a profile card listing their preferred contact methods (phone, WhatsApp, Telegram, Signal, email, Snapchat, etc.), connect with friends, and discover new people through the social graph. Think of it as Linktree meets a personal CRM — but mutual, bidirectional, and browsable.

-----

## Core data model

```
┌──────────────┐      ┌──────────────────┐      ┌───────────────┐
│    User       │──1:N─│  ContactLink     │      │  Friendship   │
├──────────────┤      ├──────────────────┤      ├───────────────┤
│ id (uuid)    │      │ id               │      │ user_a (fk)   │
│ handle       │      │ user_id (fk)     │      │ user_b (fk)   │
│ display_name │      │ type (enum)      │      │ status (enum) │
│ bio          │      │ label            │      │ created_at    │
│ avatar_url   │      │ value            │      └───────────────┘
│ created_at   │      │ sort_order       │       status: pending │
│ is_public    │      │ visibility (enum)│              accepted │
└──────────────┘      └──────────────────┘              blocked  │
```

**ContactLink types:** `phone`, `whatsapp`, `telegram`, `signal`, `email`, `snapchat`, `instagram`, `custom`

**ContactLink visibility:** `everyone`, `friends_only`, `friends_of_friends`

Friendships are stored as a single row with `user_a < user_b` (canonical ordering) to avoid duplicates. A `status` field tracks pending requests.

-----

## API surface

All endpoints return JSON. Auth via short-lived JWTs + refresh tokens.

### Auth

|Method|Path              |Notes                               |
|------|------------------|------------------------------------|
|POST  |`/auth/register`  |Handle, name, password or magic link|
|POST  |`/auth/login`     |Returns JWT pair                    |
|POST  |`/auth/magic-link`|Email/SMS OTP for passwordless      |

### Profile

|Method|Path                |Notes                               |
|------|--------------------|------------------------------------|
|GET   |`/users/:handle`    |Public profile (respects visibility)|
|PATCH |`/users/me`         |Update name, bio, avatar            |
|GET   |`/users/me/contacts`|Full contact list for owner         |
|PUT   |`/users/me/contacts`|Bulk upsert contact links           |

### Friends

|Method|Path                      |Notes                         |
|------|--------------------------|------------------------------|
|GET   |`/users/me/friends`       |Paginated friend list         |
|POST  |`/friends/request/:userId`|Send friend request           |
|POST  |`/friends/accept/:userId` |Accept pending request        |
|DELETE|`/friends/:userId`        |Unfriend                      |
|GET   |`/users/:handle/friends`  |Their friend list (if public) |
|GET   |`/users/:handle/mutuals`  |Mutual friends with the caller|

### Discovery

|Method|Path                   |Notes                                    |
|------|-----------------------|-----------------------------------------|
|GET   |`/discover/suggestions`|Friends-of-friends ranked by mutual count|
|GET   |`/discover/search?q=`  |Full-text search on name + handle        |

### Export

|Method|Path         |Notes                         |
|------|-------------|------------------------------|
|GET   |`/export/vcf`|Download friends as vCard file|
|GET   |`/export/csv`|Download friends as CSV       |

-----

## Suggested tech stack

|Layer           |Choice                     |Rationale                                                                                 |
|----------------|---------------------------|------------------------------------------------------------------------------------------|
|**API**         |Node.js + Hono (or Fastify)|Lightweight, TypeScript-native, fast cold starts                                          |
|**Database**    |PostgreSQL                 |Relational data with strong graph query support via recursive CTEs or `pg_trgm` for search|
|**Auth**        |Lucia Auth or Auth.js      |Session-based or JWT, supports magic links, OAuth                                         |
|**File storage**|Cloudflare R2 or S3        |Avatar uploads, resized with a worker                                                     |
|**Cache**       |Redis (Upstash)            |Friend-list caching, rate limiting, session store                                         |
|**Search**      |pg_trgm + GIN index        |Good enough for <1M users; graduate to Meilisearch if needed                              |
|**Hosting**     |Fly.io or Railway          |Simple deployment, Postgres included                                                      |
|**Mobile**      |React Native (Expo) or PWA |PWA first for speed; native for QR camera and NFC                                         |
|**QR**          |`qrcode` npm package       |Generate on the client; encode `https://rolodex.app/@handle`                              |

-----

## Build plan

### Phase 1 — Core loop (2–3 weeks)

The minimum viable product is: create a profile, add contact links, share it.

1. **Database schema** — Users, ContactLinks tables. Migrate with Drizzle or Prisma.
1. **Auth** — Email magic-link signup. Store sessions in Postgres.
1. **Profile CRUD** — Endpoints to create/update profile and contact links. Avatar upload to R2.
1. **Public profile page** — SSR or static route at `/@handle`. Looks like the current frontend. No login required to view.
1. **QR generation** — Client-side QR encoding the profile URL. Downloadable as PNG.

*Milestone: a person can sign up, fill in their card, and share a link/QR that anyone can view.*

### Phase 2 — Social graph (2–3 weeks)

1. **Friendships** — Request/accept/reject/unfriend flow. Friendship table with status enum.
1. **Friend list** — Paginated list on the profile. “X mutual friends” badge computed via SQL intersection.
1. **Visibility controls** — Contact links can be `everyone`, `friends_only`, or `friends_of_friends`. Enforced at the API layer.
1. **Notifications** — Friend request received/accepted. Start with in-app; add push later.

*Milestone: two people can connect, see each other’s private contact info, and browse each other’s friends.*

### Phase 3 — Discovery (1–2 weeks)

1. **Suggestions engine** — Friends-of-friends ranked by number of mutual connections. Simple SQL query with `INTERSECT` and `COUNT`.
1. **Search** — `pg_trgm` similarity search on `display_name` and `handle`. GIN index for fast prefix matching.
1. **Browse friends-of-friends** — UI to tap into a friend’s friend list and see who you have in common.

*Milestone: people can discover new connections through the graph, not just by sharing a link.*

### Phase 4 — Polish & export (1–2 weeks)

1. **Export** — Generate `.vcf` (vCard 3.0) and `.csv` files on the server. Stream large contact lists.
1. **Import** — Upload a `.vcf` or `.csv`; parse and match against existing users.
1. **Settings** — Privacy, notification preferences, account deletion.
1. **Rate limiting & abuse** — Redis-backed rate limits on search, friend requests.

### Phase 5 — Growth features (ongoing)

1. **NFC / tap-to-share** — Web NFC API or native module for physical tap exchange.
1. **Profile views** — Anonymous view counter. Optional “who viewed me” for premium.
1. **Groups/circles** — Organize friends into labeled groups (e.g., “College,” “Work,” “Climbing”).
1. **Embeddable widget** — `<iframe>` or JS snippet that renders your contact card on any website.
1. **Native app** — Expo-based React Native app wrapping the PWA with camera access for QR scanning.

-----

## Key architectural decisions

**Why not a graph database?** At the scale this product would start at (<100K users), PostgreSQL handles friend-of-friend queries efficiently with indexed joins. A graph DB (Neo4j, Dgraph) adds operational complexity without proportional benefit until the graph becomes very deep (3+ hops) or very large (>10M edges). Migrate if and when needed.

**Why contact-method-first instead of social-link-first?** The insight is that Linktree optimizes for *audience reach* (follow me on X, subscribe on YouTube), while this optimizes for *personal connection* (here’s how to actually reach me). Phone numbers, WhatsApp, and Telegram are more intimate than social follows — the product should feel like exchanging numbers, not swapping link-in-bios.

**Privacy as a feature, not an afterthought.** Contact info visibility should default to `friends_only`. The discovery layer (suggestions, search) should expose *names and mutual count* but not contact details until a connection is established. This creates a natural gate that mirrors real-life trust: you can find me, but you have to ask before I give you my number.

**QR as the primary sharing mechanic.** URLs work, but QR codes create a physical ritual — “scan me” is the new “let me give you my card.” The QR should be prominent, beautiful, and fast. Consider adding the user’s avatar to the center of the QR code.

-----

## Competitive landscape

This concept sits in a gap between several existing product categories.

**Digital business cards** (Popl, Blinq, HiHello, Wave Connect) are the closest in UX — they let you create a profile card with contact details and share via QR/NFC. But they’re fundamentally *one-directional broadcast tools* designed for professional networking. There’s no friend graph, no mutual connections, no discovery. They’re designed for the moment of exchange, not the ongoing relationship.

**Personal CRMs** (Clay, Dex, Monica) are private tools for managing *your view* of your relationships. They sync LinkedIn and email to help you remember to follow up. But they’re single-player — your contacts don’t have profiles, can’t update their own info, and there’s no social graph to browse.

**Linktree and link-in-bio tools** optimize for directing audiences to content. They’re marketing tools, not relationship tools.

**Traditional social networks** (Instagram, Facebook) have contact info buried deep and the social graph is designed around content consumption, not connection management.

The gap: nobody has built a *mutual, bidirectional contact-sharing network* with a lightweight social graph focused purely on reachability. The closest historical analogue might be the early Facebook (pre-News Feed) — when it was essentially a directory of real people with their actual contact info, and the primary action was looking someone up and seeing who you had in common.

The risk is that this is a feature, not a product — WhatsApp, iMessage, and Telegram already hold contact graphs, and any of them could ship a profile-card feature. The defensibility lies in being *platform-agnostic* (your Rolodex card links to all your messaging apps, not just one) and in the social discovery layer, which no messaging app currently does well.
