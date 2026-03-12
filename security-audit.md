# Rolodex — Security Audit

*2026-03-07T22:49:49Z by Showboat 0.6.1*
<!-- showboat-id: 148d92b7-57ae-48f6-9973-a44468ebc639 -->

Read-only security audit of the Rolodex codebase. Findings are organized by severity (CRITICAL > HIGH > MEDIUM > LOW) and vulnerability class. All file paths and line numbers reference the current HEAD.

---

## FINDING 1 — Hardcoded JWT Secret (CRITICAL)

**Class:** Secrets & Auth — Hardcoded credentials
**File:** `src/services/auth.ts:8`
**Exploitability:** Trivial — attacker forges arbitrary JWTs

The JWT signing secret has a hardcoded default that will be used unless the `JWT_SECRET` environment variable is explicitly set:

```bash
sed -n '3,11p' src/services/auth.ts | cat -n
```

```output
     1	import { users, magicLinks } from "../db/schema.js";
     2	import { eq } from "drizzle-orm";
     3	import { v4 as uuid } from "uuid";
     4	import { email } from "./email.js";
     5	
     6	const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
     7	const JWT_EXPIRES_IN = "15m";
     8	const REFRESH_EXPIRES_IN = "7d";
     9	const MAGIC_LINK_TTL_MINUTES = 15;
```

**Exploit scenario:** An attacker who reads the source (it's on GitHub) can forge JWTs for any user ID and handle, gaining full account access — read contacts, send friend requests, delete accounts. No brute force needed; the secret is in plain text.

SUGGESTION: Require JWT_SECRET at startup; crash if unset. Replace the fallback with a mandatory env var check.

---

## FINDING 2 — Unauthenticated Seed Endpoint (CRITICAL)

**Class:** Broken Authentication
**File:** `src/routes/seed.ts:15`
**Exploitability:** Trivial — single POST, no auth required

```bash
sed -n '15,27p' src/routes/seed.ts | cat -n
```

```output
     1	seed.post("/seed", async (c) => {
     2	  // Check if data already exists
     3	  const existing = await db.select().from(users).limit(1);
     4	  if (existing.length > 0) {
     5	    // Find the first user and return tokens for them
     6	    const me = await db
     7	      .select()
     8	      .from(users)
     9	      .where(eq(users.handle, "jordanr"))
    10	      .limit(1);
    11	    if (me.length > 0) {
    12	      const tokens = authService.generateTokens(me[0].id, me[0].handle);
    13	      return c.json({ message: "Already seeded", userId: me[0].id, ...tokens });
```

**Exploit scenario:** Any unauthenticated user can POST /seed to get valid JWT tokens for the jordanr account. If the database is already populated, it still returns tokens (line 12). This is a token dispensary — anyone can impersonate the seed user.

SUGGESTION: Gate behind NODE_ENV !== "production" or remove entirely in production.

---

## FINDING 3 — Path Traversal + Unrestricted File Upload (HIGH)

**Class:** Path Traversal, Unrestricted Upload
**Files:** `src/routes/profile.ts:105`, `src/services/storage.ts:25`
**Exploitability:** Moderate — requires authenticated user with crafted filename

```bash
sed -n '104,110p' src/routes/profile.ts | cat -n
```

```output
     1	  if (avatarFile) {
     2	    const ext = avatarFile.name.split(".").pop() || "jpg";
     3	    const key = `avatars/${userId}.${ext}`;
     4	    const buffer = Buffer.from(await avatarFile.arrayBuffer());
     5	    const url = await storage.upload(key, buffer, avatarFile.type);
     6	    updates.avatarUrl = url;
     7	  }
```

```bash
sed -n '24,30p' src/services/storage.ts | cat -n
```

```output
     1	  async upload(key: string, data: Buffer, _contentType?: string): Promise<string> {
     2	    const filePath = join(UPLOAD_DIR, key);
     3	    await ensureDir(dirname(filePath));
     4	    await writeFile(filePath, data);
     5	    // Return a URL path that the API can serve
     6	    return `/uploads/${key}`;
     7	  },
```

**Exploit scenario:** No validation of file extension, content-type, magic bytes, or file size. An attacker could upload an .html file as their avatar, which gets served by the same origin at /uploads/avatars/{id}.html via the serveStatic middleware. This is stored XSS: the attacker hosts arbitrary HTML/JS on the application's domain. Additionally, there's no file size limit — uploading a multi-GB file would exhaust disk.

The path traversal risk is partially mitigated because the key is constructed as avatars/{userId}.{ext} where userId is a server-generated UUID, but storage.upload uses path.join which resolves .. segments, so the defense is fragile.

SUGGESTION: Whitelist allowed extensions (jpg, jpeg, png, gif, webp), enforce a 5MB size limit, and validate that the resolved path stays within UPLOAD_DIR.

---

## FINDING 4 — DOM-Based XSS via Unsanitized API Response (HIGH)

**Class:** XSS — DOM-based
**File:** `rolodex.html:1136`
**Exploitability:** Moderate — requires attacker-controlled API response or MITM

```bash
sed -n '1133,1139p' rolodex.html | cat -n
```

```output
     1	    const res = await api(`/qr/${handle}/data-url`);
     2	    if (res.ok) {
     3	      const data = await res.json();
     4	      document.getElementById('qr-box').innerHTML = `<img src="${data.dataUrl}" alt="QR Code for @${handle}">`;
     5	    } else {
     6	      document.getElementById('qr-box').innerHTML = '<p style="color:var(--stone-400);font-size:0.82rem">QR generation failed</p>';
     7	    }
```

**Exploit scenario:** data.dataUrl from the API response is interpolated directly into innerHTML without escaping. If an attacker can manipulate the API response (MITM, compromised backend, or proxy injection), they could set dataUrl to:

    " onerror="alert(document.cookie)" x="

producing <img src="" onerror="alert(document.cookie)" ...>. The frontend consistently uses escHtml() for user-controlled strings (names, handles, bios), but implicitly trusts API response fields used in src attributes.

SUGGESTION: Validate that dataUrl starts with "data:image/" before inserting into innerHTML, or use DOM APIs (createElement + setAttribute) instead of innerHTML.

---

## FINDING 5 — Wildcard CORS (HIGH)

**Class:** Misconfiguration
**File:** `src/app.ts:23`
**Exploitability:** Easy — any website can make authenticated cross-origin requests

```bash
sed -n '22,24p' src/app.ts | cat -n
```

```output
     1	app.use("*", logger());
     2	app.use("*", cors());
     3	
```

**Exploit scenario:** cors() with no arguments sets Access-Control-Allow-Origin: *. Any website can make API calls to the Rolodex backend. Since auth uses Bearer tokens (not cookies), the immediate risk is limited — an attacker's page can't steal tokens from localStorage cross-origin. But if a victim is tricked into pasting a token on the attacker's site, the attacker can use it against the wildcard-CORS API with full access.

SUGGESTION: Restrict to the actual frontend origin via the origin option.

---

## FINDING 6 — No Email Validation on Registration (MEDIUM)

**Class:** Input Validation
**File:** `src/routes/auth.ts:18`

```bash
sed -n '18,23p' src/routes/auth.ts | cat -n
```

```output
     1	  if (!body.handle || !body.email || !body.displayName) {
     2	    return c.json({ error: "handle, email, and displayName are required" }, 400);
     3	  }
     4	
     5	  // Basic handle validation
     6	  if (!/^[a-zA-Z0-9_]{3,30}$/.test(body.handle)) {
```

**Exploit scenario:** The handle is validated with a regex, but the email is only checked for truthiness — not format. The displayName has no length limit. A user can register with email: "not-an-email" or displayName: a 10MB string. Long display names cause DB bloat and slow serialization when they appear in friend lists, suggestions, and notifications.

SUGGESTION: Add email format validation and length limits for displayName (e.g., max 100 chars).

---

## FINDING 7 — No Pagination Limit Cap (MEDIUM)

**Class:** Denial of Service
**Files:** `src/routes/friends.ts:17`, `src/routes/discovery.ts:17,81`

```bash
grep -n 'parseInt.*limit' src/routes/friends.ts src/routes/discovery.ts
```

```output
src/routes/friends.ts:17:  const limit = parseInt(c.req.query("limit") || "20", 10);
src/routes/friends.ts:132:  const limit = parseInt(c.req.query("limit") || "20", 10);
src/routes/friends.ts:187:  const limit = parseInt(c.req.query("limit") || "20", 10);
src/routes/discovery.ts:17:  const limit = parseInt(c.req.query("limit") || "20", 10);
src/routes/discovery.ts:81:  const limit = parseInt(c.req.query("limit") || "20", 10);
```

**Exploit scenario:** The limit query parameter is parsed but never capped. ?limit=1000000 forces the server to fetch and serialize entire tables. Memory exhaustion DoS.

SUGGESTION: Cap with Math.min(parseInt(...), 100).

---

## FINDING 8 — Magic Link Tokens Logged to stdout (MEDIUM)

**Class:** Secrets in Logs
**File:** `src/services/email.ts:21`

```bash
sed -n '17,22p' src/services/email.ts | cat -n
```

```output
     1	    console.log("──────────────────────────────────────");
     2	    console.log("📧 EMAIL STUB (would send in production)");
     3	    console.log(`   To:      ${options.to}`);
     4	    console.log(`   Subject: ${options.subject}`);
     5	    console.log(`   Body:    ${options.text}`);
     6	    console.log("──────────────────────────────────────");
```

**Exploit scenario:** The email body contains the magic link token (a UUID that grants full account access). Anyone with log access (centralized logging, shared terminals) can extract tokens. Even when the stub is replaced with a real email service, this console.log may remain as debug code.

SUGGESTION: Only log in development, or redact the token from log output.

---

## FINDING 9 — No Token Revocation Mechanism (MEDIUM)

**Class:** JWT Misconfiguration
**File:** `src/services/auth.ts:48-60`

Refresh tokens are stateless JWTs with 7-day expiry. There is no server-side revocation list. Signing out (frontend clearTokens()) does not invalidate tokens — a stolen refresh token remains usable for up to 7 days. Account deletion also does not revoke outstanding tokens.

SUGGESTION: Store refresh tokens in the database. Check on refresh, delete on sign-out and account deletion.

---

## FINDING 10 — Rate Limiting Bypass via Header Spoofing (MEDIUM)

**Class:** Broken Authentication
**File:** `src/lib/rate-limit.ts:21`

```bash
sed -n '21,24p' src/lib/rate-limit.ts | cat -n
```

```output
     1	    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
     2	    const userId = c.get("userId");
     3	    const identifier = userId || ip;
     4	    const key = `rl:${opts.prefix}:${identifier}`;
```

**Exploit scenario:** X-Forwarded-For is client-controllable. An attacker bypasses all rate limits by randomizing this header. For unauthenticated endpoints (/auth/*), userId is undefined so the identifier is entirely the spoofable IP.

SUGGESTION: Use the actual socket IP, or only trust X-Forwarded-For behind a known reverse proxy.

---

## FINDING 11 — Rate Limiting Gaps on Expensive Endpoints (MEDIUM)

**Class:** Denial of Service
**File:** `src/app.ts:26-28`

Only /discover/search, /friends/request/*, and /auth/* are rate-limited. Missing: POST /seed, GET /export/vcf, GET /export/csv (N+1 queries), GET /qr/:handle/* (CPU-intensive QR generation), PATCH /users/me (avatar upload), DELETE /settings/account.

SUGGESTION: Add rate limiting to export, QR, seed, and account deletion endpoints.

---

## FINDING 12 — No Length or Type Validation on Profile Fields (MEDIUM)

**Class:** Input Validation
**File:** `src/routes/profile.ts:92-101`

displayName and bio from PATCH /users/me are written to the database with no length limits or type checks. isPublic is accepted without type validation — a non-boolean value would be stored. Can cause DB bloat and layout abuse.

SUGGESTION: Enforce length limits (displayName max 100, bio max 500) and validate isPublic is boolean.

---

## FINDING 13 — Contact Link Fields Not Validated Against Enums (MEDIUM)

**Class:** Input Validation / Data Integrity
**File:** `src/routes/profile.ts:176`

```bash
sed -n '173,181p' src/routes/profile.ts | cat -n
```

```output
     1	  const newLinks = body.contacts.map((contact, i) => ({
     2	    id: uuid(),
     3	    userId,
     4	    type: contact.type as any,
     5	    label: contact.label,
     6	    value: contact.value,
     7	    sortOrder: contact.sortOrder ?? i,
     8	    visibility: (contact.visibility as any) ?? "friends_only",
     9	  }));
```

The "as any" casts (lines 4, 8) bypass TypeScript enum validation. An attacker can store arbitrary type and visibility values. A custom visibility value (e.g., empty string) could bypass the visibility service since canViewContactLink only checks for the three known values and returns false for unknowns — but a value like "everyone " (with trailing space) would also bypass. No array length cap either — unlimited contacts per user.

SUGGESTION: Validate type and visibility against the enum values. Cap contacts at 20. Add length limits on labels and values.

---

## FINDING 14 — QR Endpoints Enable User Enumeration (LOW)

**Class:** Information Disclosure
**File:** `src/routes/qr.ts:12`

Both QR endpoints are unauthenticated and not rate-limited. An attacker can enumerate valid handles via 200 vs 404 responses.

SUGGESTION: Rate limit QR endpoints.

---

## FINDING 15 — TOCTOU Race in Friend Request / Registration (LOW)

**Class:** Race Conditions
**File:** `src/services/friends.ts:36-51`

```bash
sed -n '36,51p' src/services/friends.ts | cat -n
```

```output
     1	    const existing = await this.getFriendship(fromId, toId);
     2	    if (existing) {
     3	      if (existing.status === "accepted") return { error: "Already friends" };
     4	      if (existing.status === "pending") return { error: "Request already pending" };
     5	      if (existing.status === "blocked") return { error: "Cannot send request" };
     6	    }
     7	
     8	    const [a, b] = canonicalPair(fromId, toId);
     9	    await db.insert(friendships).values({
    10	      userA: a,
    11	      userB: b,
    12	      status: "pending",
    13	      initiatedBy: fromId,
    14	    });
    15	
    16	    return { ok: true };
```

TOCTOU gap between the existence check (line 1) and the insert (line 9). Two concurrent requests between the same users could both pass the check. The unique index catches one insert, but the error isn't caught — it surfaces as a 500. Same pattern exists in authService.register.

SUGGESTION: Catch SQLITE_CONSTRAINT_UNIQUE errors gracefully, or use a transaction with INSERT OR IGNORE.

---

## FINDING 16 — CSV Formula Injection in Exports (LOW)

**Class:** Injection — CSV
**File:** `src/lib/csv.ts:53`

```bash
sed -n '53,58p' src/lib/csv.ts | cat -n
```

```output
     1	function csvEscape(value: string): string {
     2	  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
     3	    return `"${value.replace(/"/g, '""')}"`;
     4	  }
     5	  return value;
     6	}
```

csvEscape handles commas, quotes, and newlines, but doesn't neutralize formula trigger characters (=, +, -, @). An attacker could set their display name to =cmd|'/C calc'!A0 and when a victim exports contacts as CSV and opens in Excel, the formula executes. Low risk because modern spreadsheets warn about this.

SUGGESTION: Prefix cells starting with =, +, -, or @ with a single quote.

---

## FINDING 17 — Content-Disposition Header Injection (LOW)

**Class:** HTTP Header Injection
**File:** `src/routes/qr.ts:31`

```bash
sed -n '28,33p' src/routes/qr.ts | cat -n
```

```output
     1	  return new Response(new Uint8Array(png), {
     2	    headers: {
     3	      "Content-Type": "image/png",
     4	      "Content-Disposition": `inline; filename="${handle}-qr.png"`,
     5	    },
     6	  });
```

Handle is interpolated directly into the Content-Disposition header. The registration regex restricts handles to [a-zA-Z0-9_]{3,30}, but the QR route itself does not re-validate. Theoretical risk only — unexploitable with current handle constraints.

SUGGESTION: Re-validate the handle pattern or sanitize the filename.

---

## SEVERITY SUMMARY

### CRITICAL (2)

| # | Finding | File | Impact |
|---|---------|------|--------|
| 1 | Hardcoded JWT secret | src/services/auth.ts:8 | Full auth bypass — forge tokens for any user |
| 2 | Unauthenticated seed endpoint returns tokens | src/routes/seed.ts:15 | Any visitor gets valid JWT tokens |

### HIGH (3)

| # | Finding | File | Impact |
|---|---------|------|--------|
| 3 | Unrestricted file upload (type, size) | src/routes/profile.ts:105 | Stored XSS via .html upload, DoS via large files |
| 4 | DOM XSS via unsanitized API data in innerHTML | rolodex.html:1136 | Script execution if API response is tampered |
| 5 | Wildcard CORS | src/app.ts:23 | Cross-origin API access from any website |

### MEDIUM (8)

| # | Finding | File | Impact |
|---|---------|------|--------|
| 6 | No email validation on registration | src/routes/auth.ts:18 | Data integrity, potential abuse |
| 7 | No pagination limit cap | Multiple routes | Memory exhaustion DoS |
| 8 | Magic link tokens logged to stdout | src/services/email.ts:21 | Token theft via log access |
| 9 | No token revocation (stateless JWT) | src/services/auth.ts:48 | Stolen tokens irrevocable for 7 days |
| 10 | Rate limiting bypass via X-Forwarded-For | src/lib/rate-limit.ts:21 | Brute force auth, spam requests |
| 11 | Rate limiting gaps on expensive endpoints | src/app.ts:26 | DoS via export/QR/seed spam |
| 12 | No length/type validation on profile fields | src/routes/profile.ts:99 | DB bloat, layout abuse |
| 13 | Contact link fields not validated against enums | src/routes/profile.ts:176 | Visibility bypass, data corruption |

### LOW (4)

| # | Finding | File | Impact |
|---|---------|------|--------|
| 14 | QR endpoints enable user enumeration | src/routes/qr.ts:12 | Handle discovery |
| 15 | TOCTOU race in friend request / registration | src/services/friends.ts:36 | Duplicate rows, 500 errors |
| 16 | CSV formula injection in exports | src/lib/csv.ts:53 | Spreadsheet formula execution |
| 17 | Content-Disposition header injection (theoretical) | src/routes/qr.ts:31 | Requires non-standard handle |

### Not Found (No Evidence)

- **SQL injection:** All queries use Drizzle ORM parameterized queries — sql template literals bind parameters, no string concatenation
- **Command injection:** No exec, spawn, or child_process usage anywhere in the codebase
- **SSRF:** No user-supplied URLs are fetched server-side
- **Prototype pollution:** No Object.assign on user input without filtering
- **SSTI / XXE:** No template engines, no XML parsing
- **Agent-specific issues:** No LLM or agent functionality in the codebase
- **Insecure deserialization:** All JSON parsing uses standard JSON.parse / Hono's c.req.json()
- **CVEs in dependencies:** jsonwebtoken 9.0.2, qrcode 1.5.4, better-sqlite3 11.x, hono 4.6.x — no known critical CVEs at time of audit
