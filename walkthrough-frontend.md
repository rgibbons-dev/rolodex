# Rolodex — Frontend Walkthrough

*2026-02-28T22:26:03Z by Showboat 0.6.1*
<!-- showboat-id: 2743801f-675a-4610-8f79-302b04280de9 -->

This walkthrough explains the Rolodex frontend — a single-file HTML application that talks to the backend API built in the previous commit. It replaces the hardcoded mock data in `rolodex-alpha.html` with real API calls, JWT-based authentication, and async data loading while keeping the same visual design.

The frontend lives in one file, `rolodex.html` (~1,300 lines), and uses zero external JavaScript dependencies. All state management, routing, and rendering is done with vanilla JS. The backend changes for this commit are small: a new seed route (`src/routes/seed.ts`) and two lines in `src/app.ts` to serve static HTML files.

## 1. File Structure of the Commit

What changed in commit `95b9dbc`:

```bash
git show --stat 95b9dbc
```

```output
commit 95b9dbc8364e63a49b562da1c6921b1a4dcb3e4e
Author: Claude <noreply@anthropic.com>
Date:   Sat Feb 28 22:18:23 2026 +0000

    Add API-backed frontend and seed endpoint
    
    New files:
    - rolodex.html: Full frontend rewrite that talks to the real backend API.
      Same visual design as the alpha prototype but all data flows through
      HTTP endpoints instead of hardcoded mock data. Features:
      - Auth flow (register, magic link login, token refresh)
      - JWT token management with localStorage persistence
      - Profile view loading from GET /users/:handle
      - Friends list from GET /users/me/friends with client-side search
      - Discovery from /discover/suggestions and /discover/search
      - Real QR codes from /qr/:handle/data-url
      - Notifications from /users/me/notifications
      - Export (vCard/CSV) via /export endpoints
      - Settings (privacy toggle, profile edit, sign out)
      - "Seed demo data" button for first-run experience
    
    - src/routes/seed.ts: POST /seed endpoint that populates the database
      with 11 users, contact links, and 20 friendships matching the alpha
      mock data. Returns JWT tokens for immediate login. Idempotent.
    
    Modified:
    - src/app.ts: Register seed route and serve HTML files as static assets
    - src/index.ts: Recreated (was missing from working tree)
    
    The original rolodex-alpha.html is preserved unchanged.
    
    https://claude.ai/code/session_01X2VM7AN1wqiQPpYCErKLoW

 rolodex.html       | 1311 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/app.ts         |    6 +
 src/routes/seed.ts |  189 ++++++++
 3 files changed, 1506 insertions(+)
```

Three files: the main frontend (`rolodex.html`), the seed endpoint (`src/routes/seed.ts`), and two small additions to the app shell (`src/app.ts`). Let's trace through each piece.

## 2. Backend: Serving HTML Files

The app shell gained two static-file routes and a seed route import:

```bash
grep -n 'seed\|serveStatic.*rolodex' src/app.ts
```

```output
13:import seedRoutes from "./routes/seed.js";
41:app.route("/", seedRoutes);
44:app.use("/rolodex.html", serveStatic({ path: "./rolodex.html" }));
45:app.use("/rolodex-alpha.html", serveStatic({ path: "./rolodex-alpha.html" }));
```

Line 13 imports the seed route module. Line 41 mounts it at the root (its internal path is `/seed`, so requests go to `POST /seed`). Lines 44–45 use Hono's `serveStatic` to serve both the new frontend and the original alpha prototype as plain HTML files from the project root.

## 3. Backend: The Seed Endpoint

The seed route gives the frontend a single button to go from empty database to working demo. It creates 11 users, their contact links, and 20 friendships — the same social graph that the alpha prototype hardcoded in JavaScript.

```bash
sed -n '14,30p' src/routes/seed.ts | cat -n
```

```output
     1	 */
     2	seed.post("/seed", async (c) => {
     3	  // Check if data already exists
     4	  const existing = await db.select().from(users).limit(1);
     5	  if (existing.length > 0) {
     6	    // Find the first user and return tokens for them
     7	    const me = await db
     8	      .select()
     9	      .from(users)
    10	      .where(eq(users.handle, "jordanr"))
    11	      .limit(1);
    12	    if (me.length > 0) {
    13	      const tokens = authService.generateTokens(me[0].id, me[0].handle);
    14	      return c.json({ message: "Already seeded", userId: me[0].id, ...tokens });
    15	    }
    16	    return c.json({ message: "Already seeded" });
    17	  }
```

The idempotency guard on line 4 checks whether any users exist. If the database is already populated, it still generates fresh JWT tokens for the demo user \`jordanr\` (line 13) — this way clicking "Seed demo data" always logs you in, even on subsequent calls.

When the database is empty, the endpoint inserts users, contact links, and friendships:

```bash
sed -n '33,45p' src/routes/seed.ts | cat -n
```

```output
     1	  const userDefs = [
     2	    { handle: "jordanr", email: "jordan@hey.com", displayName: "Jordan Rivera", bio: "Design engineer in Brooklyn. Coffee, climbing, open source." },
     3	    { handle: "mikac", email: "mika@gmail.com", displayName: "Mika Chen", bio: "Product designer at Figma. Dog mom. Dim sum enthusiast." },
     4	    { handle: "samokafor", email: "sam@okafor.dev", displayName: "Sam Okafor", bio: "Fullstack dev. Lagos \u2192 NYC. Building things that matter." },
     5	    { handle: "priyash", email: "priya@substack.com", displayName: "Priya Sharma", bio: "Writer & editor. Tea > coffee. Working on my first novel." },
     6	    { handle: "leom", email: "leo@35mm.mx", displayName: "Leo Mart\u00ednez", bio: "Photographer. Analog film only. Mexico City based." },
     7	    { handle: "noorar", email: "noor@proton.me", displayName: "Noor Al-Rashid", bio: "UX researcher. Accessibility advocate. Cat person." },
     8	    { handle: "alexk", email: "alex@startup.io", displayName: "Alex Kim", bio: "Startup founder. Ex-Google. Endlessly optimistic." },
     9	    { handle: "zaraosei", email: "zara@data.co", displayName: "Zara Osei", bio: "Data scientist. Marathon runner. Podcast addict." },
    10	    { handle: "tomasb", email: "tomas@sound.se", displayName: "Tom\u00e1s Bergstr\u00f6m", bio: "Sound designer. Synth collector. Stockholm." },
    11	    { handle: "mayaj", email: "maya@art.com", displayName: "Maya Johnson", bio: "Illustrator & muralist. Big colors, bigger dreams." },
    12	    { handle: "ravip", email: "ravi@spice.com", displayName: "Ravi Patel", bio: "Chef. Cookbook author. Spice is life." },
    13	  ];
```

Eleven users, each with a handle, email, display name, and bio. The first user — \`jordanr\` — becomes the logged-in user when the frontend calls seed. Each user gets a set of contact links with varying visibility levels:

```bash
sed -n '56,63p' src/routes/seed.ts | cat -n
```

```output
     1	    jordanr: [
     2	      { type: "phone", label: "Phone", value: "+1 (917) 555-0142", visibility: "friends_only" },
     3	      { type: "whatsapp", label: "WhatsApp", value: "+1 (917) 555-0142", visibility: "friends_only" },
     4	      { type: "telegram", label: "Telegram", value: "@jordanr", visibility: "everyone" },
     5	      { type: "email", label: "Email", value: "jordan@hey.com", visibility: "everyone" },
     6	      { type: "signal", label: "Signal", value: "+1 (917) 555-0142", visibility: "friends_only" },
     7	      { type: "snapchat", label: "Snapchat", value: "@jrivera", visibility: "friends_of_friends" },
     8	    ],
```

Jordan's phone, WhatsApp, and Signal are \`friends_only\` — only direct friends can see them. Telegram and Email are \`everyone\` — public. Snapchat is \`friends_of_friends\`. The backend's visibility service filters these based on the viewer's relationship to the profile owner, so the same profile endpoint returns different contact links for different viewers.

After users and contacts, the seed creates a social graph of 20 bidirectional friendships:

```bash
sed -n '142,163p' src/routes/seed.ts | cat -n
```

```output
     1	  const friendPairs: [string, string][] = [
     2	    ["jordanr", "mikac"],
     3	    ["jordanr", "samokafor"],
     4	    ["jordanr", "priyash"],
     5	    ["jordanr", "leom"],
     6	    ["jordanr", "noorar"],
     7	    ["mikac", "samokafor"],
     8	    ["mikac", "priyash"],
     9	    ["mikac", "alexk"],
    10	    ["mikac", "zaraosei"],
    11	    ["samokafor", "leom"],
    12	    ["samokafor", "zaraosei"],
    13	    ["samokafor", "tomasb"],
    14	    ["priyash", "alexk"],
    15	    ["priyash", "mayaj"],
    16	    ["leom", "noorar"],
    17	    ["leom", "tomasb"],
    18	    ["noorar", "mayaj"],
    19	    ["noorar", "ravip"],
    20	    ["alexk", "zaraosei"],
    21	    ["zaraosei", "ravip"],
    22	  ];
```

Jordan (\`jordanr\`) is friends with 5 people: Mika, Sam, Priya, Leo, and Noor. That means the remaining 5 users (Alex, Zara, Tomás, Maya, Ravi) are non-friends who should appear in the discovery suggestions, ranked by their number of mutual connections to Jordan.

The insertion loop on line 168 applies the canonical ordering \`(userA < userB)\` that the friendship service requires:

```bash
sed -n '165,186p' src/routes/seed.ts | cat -n
```

```output
     1	  for (const [handleA, handleB] of friendPairs) {
     2	    const idA = userIds[handleA];
     3	    const idB = userIds[handleB];
     4	    const [a, b] = idA < idB ? [idA, idB] : [idB, idA];
     5	    await db.insert(friendships).values({
     6	      userA: a,
     7	      userB: b,
     8	      status: "accepted",
     9	      initiatedBy: idA,
    10	    });
    11	  }
    12	
    13	  // Return tokens for "jordanr" so the frontend can log in immediately
    14	  const meId = userIds["jordanr"];
    15	  const tokens = authService.generateTokens(meId, "jordanr");
    16	
    17	  return c.json({
    18	    message: "Seeded 11 users with contacts and friendships",
    19	    userId: meId,
    20	    handle: "jordanr",
    21	    ...tokens,
    22	  }, 201);
```

Line 4 sorts UUIDs so \`userA\` is always the lexicographically smaller ID — this matches the schema's unique constraint and the friendship service's canonical pair logic. Line 15 generates JWTs (access + refresh) for \`jordanr\` and returns them in the response body. The frontend saves these to localStorage and skips the auth screen.

Now let's trace through the frontend itself.

## 4. Frontend Document Structure

The entire frontend lives in \`rolodex.html\` — a single \`<html>\` file with embedded \`<style>\` and \`<script>\` blocks. No build step, no bundler, no external JS.

```bash
sed -n '1,9p' rolodex.html | cat -n
```

```output
     1	<!DOCTYPE html>
     2	<html lang="en">
     3	<head>
     4	<meta charset="UTF-8">
     5	<meta name="viewport" content="width=device-width, initial-scale=1.0">
     6	<title>Rolodex</title>
     7	<link rel="preconnect" href="https://fonts.googleapis.com">
     8	<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700&display=swap" rel="stylesheet">
     9	<style>
```

Two Google Fonts: **DM Sans** for body text and **Fraunces** (a variable serif) for headings. The same pair used in the alpha prototype.

The HTML body is minimal — just a mount point, a toast element, and a QR modal shell:

```bash
sed -n '248,260p' rolodex.html | cat -n
```

```output
     1	<body>
     2	
     3	<div class="app-shell" id="app"></div>
     4	<div class="toast" id="toast"></div>
     5	<div class="modal-overlay" id="qr-modal">
     6	  <div class="modal">
     7	    <h3 id="qr-title">Share Profile</h3>
     8	    <p id="qr-sub">Scan to add me</p>
     9	    <div class="qr-box" id="qr-box"><div class="spinner"></div></div>
    10	    <button class="btn btn-secondary" onclick="closeQR()" style="width:100%">Done</button>
    11	  </div>
    12	</div>
    13	
```

Three elements in the body:

1. **\`#app\`** — the mount point. All views are rendered into this div via \`innerHTML\`. It's styled as \`app-shell\` — a centered 460px-wide container that simulates a mobile screen.
2. **\`#toast\`** — a fixed-position notification pill at the bottom. JS toggles the \`.show\` class to animate it in and out.
3. **\`#qr-modal\`** — a full-screen overlay for QR codes. The modal is always in the DOM; its \`.open\` class controls visibility via CSS opacity and pointer-events.

Everything else is generated by JavaScript.

## 5. CSS Design System

The CSS (lines 9–246) defines a complete design system using CSS custom properties. The color palette mirrors Tailwind's stone, amber, teal, rose, blue, and violet scales:

```bash
sed -n '12,55p' rolodex.html | cat -n
```

```output
     1	:root {
     2	--stone-50: #fafaf9;
     3	--stone-100: #f5f5f4;
     4	--stone-200: #e7e5e4;
     5	--stone-300: #d6d3d1;
     6	--stone-400: #a8a29e;
     7	--stone-500: #78716c;
     8	--stone-600: #57534e;
     9	--stone-700: #44403c;
    10	--stone-800: #292524;
    11	--stone-900: #1c1917;
    12	--stone-950: #0c0a09;
    13	--amber-50: #fffbeb;
    14	--amber-100: #fef3c7;
    15	--amber-200: #fde68a;
    16	--amber-400: #fbbf24;
    17	--amber-500: #f59e0b;
    18	--amber-600: #d97706;
    19	--teal-50: #f0fdfa;
    20	--teal-100: #ccfbf1;
    21	--teal-400: #2dd4bf;
    22	--teal-500: #14b8a6;
    23	--teal-600: #0d9488;
    24	--teal-700: #0f766e;
    25	--rose-50: #fff1f2;
    26	--rose-400: #fb7185;
    27	--rose-500: #f43f5e;
    28	--blue-50: #eff6ff;
    29	--blue-400: #60a5fa;
    30	--blue-500: #3b82f6;
    31	--violet-50: #f5f3ff;
    32	--violet-400: #a78bfa;
    33	--violet-500: #8b5cf6;
    34	--green-400: #4ade80;
    35	--green-500: #22c55e;
    36	--green-600: #16a34a;
    37	--radius: 16px;
    38	--radius-sm: 10px;
    39	--radius-full: 9999px;
    40	--shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
    41	--shadow-md: 0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
    42	--shadow-lg: 0 12px 32px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04);
    43	--shadow-xl: 0 20px 50px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06);
    44	}
```

The stone scale provides neutral grays. Teal is the primary accent (active nav items, CTA buttons, links). Amber is secondary (notification icons, export rows). Rose is for warnings (sign out, delete). Three border-radius tiers (\`16px\`, \`10px\`, \`9999px\` for pills) and four box-shadow levels create consistent depth.

Key component styles include:

- **\`.app-shell\`**: A 460px centered column — mimics a phone screen on desktop
- **\`.view\`**: Absolutely-positioned, scrollable panels with bottom padding for the nav bar
- **\`.top-bar\`**: Sticky header with \`backdrop-filter: blur(16px)\` for a frosted-glass effect
- **\`.bottom-nav\`**: Fixed at the bottom, also with backdrop blur
- **\`.person-row\`**: Flex row for friend/user list items with hover/active states
- **\`.contact-link\`**: Cards for each contact method, with per-type icon colors
- **\`.auth-screen\`**: Full-viewport centered layout for login/register
- **\`.spinner\`**: CSS-only loading indicator using \`border-top-color\` animation

## 6. The API Client

The JavaScript starts (line 261) with the API client layer — the bridge between the UI and the backend:

```bash
sed -n '261,316p' rolodex.html | cat -n
```

```output
     1	<script>
     2	// ═══════════════════════════════════════════
     3	//  API CLIENT
     4	// ═══════════════════════════════════════════
     5	const API = window.location.origin;
     6	
     7	function getTokens() {
     8	  try { return JSON.parse(localStorage.getItem('rolodex_tokens') || 'null'); }
     9	  catch { return null; }
    10	}
    11	
    12	function saveTokens(tokens) {
    13	  localStorage.setItem('rolodex_tokens', JSON.stringify(tokens));
    14	}
    15	
    16	function clearTokens() {
    17	  localStorage.removeItem('rolodex_tokens');
    18	  localStorage.removeItem('rolodex_me');
    19	}
    20	
    21	async function api(path, opts = {}) {
    22	  const tokens = getTokens();
    23	  const headers = { ...(opts.headers || {}) };
    24	
    25	  if (tokens?.accessToken) {
    26	    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    27	  }
    28	
    29	  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    30	    headers['Content-Type'] = 'application/json';
    31	    opts.body = JSON.stringify(opts.body);
    32	  }
    33	
    34	  const res = await fetch(`${API}${path}`, { ...opts, headers });
    35	
    36	  // Try refresh if 401
    37	  if (res.status === 401 && tokens?.refreshToken) {
    38	    const refreshRes = await fetch(`${API}/auth/refresh`, {
    39	      method: 'POST',
    40	      headers: { 'Content-Type': 'application/json' },
    41	      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    42	    });
    43	    if (refreshRes.ok) {
    44	      const newTokens = await refreshRes.json();
    45	      saveTokens(newTokens);
    46	      headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
    47	      return fetch(`${API}${path}`, { ...opts, headers });
    48	    } else {
    49	      clearTokens();
    50	      renderApp('auth');
    51	      throw new Error('Session expired');
    52	    }
    53	  }
    54	
    55	  return res;
    56	}
```

The \`api()\` function (line 21) is the single point of contact with the backend. Every API call in the app goes through it. Here's what it does:

1. **Token injection** (line 25): Reads JWT tokens from localStorage and attaches the access token as a \`Bearer\` header.
2. **Auto-JSON serialization** (line 29): If the body is a plain object (not FormData), it serializes to JSON and sets the \`Content-Type\` header.
3. **Transparent token refresh** (line 37): If the server returns 401, it attempts a refresh using the refresh token. On success, it saves the new tokens and **replays the original request**. On failure, it clears tokens and redirects to the auth screen.

The token storage uses \`localStorage\` under the key \`rolodex_tokens\`:

- \`getTokens()\` parses the stored JSON (returning \`null\` if absent or corrupt)
- \`saveTokens()\` writes both tokens as a JSON object
- \`clearTokens()\` removes tokens and the cached user profile

Since access tokens expire after 15 minutes (set by the backend's \`authService.generateTokens\`), the refresh mechanism means the user stays logged in for up to 7 days without re-authenticating.

## 7. Application State

The app manages state with a handful of module-level variables:

```bash
sed -n '318,330p' rolodex.html | cat -n
```

```output
     1	// ═══════════════════════════════════════════
     2	//  STATE
     3	// ═══════════════════════════════════════════
     4	let currentView = 'auth';
     5	let viewStack = [];
     6	let discoverTab = 'suggestions';
     7	let ME = null; // Current user from API
     8	let unreadNotifCount = 0;
     9	
    10	// Caches for current render cycle
    11	let friendsCache = null;
    12	let pendingRequestsCache = null;
    13	
```

Six state variables control the entire app:

- **\`currentView\`**: Which screen is active (\`auth\`, \`my-profile\`, \`friends\`, \`discover\`, \`settings\`, \`profile\`). The router switch statement reads this.
- **\`viewStack\`**: A stack of user handles for drill-down navigation. When you tap a friend to view their profile, their handle gets pushed. The Back button pops it. If the stack empties, you return to the friends list.
- **\`ME\`**: The current user's full profile object — loaded from the API on login, cached in memory and localStorage.
- **\`unreadNotifCount\`**: Drives the red dot on the Settings nav button.
- **\`friendsCache\`** / **\`pendingRequestsCache\`**: Short-lived caches that prevent redundant API calls when switching tabs. They're explicitly invalidated (set to \`null\`) when the user sends a friend request.

## 8. Helpers and Utilities

Before the view renderers, a set of small helpers handle avatar generation, HTML escaping, and toast notifications:

```bash
sed -n '334,384p' rolodex.html | cat -n
```

```output
     1	const COLORS = [
     2	  ['#0d9488','#ccfbf1'], ['#d97706','#fef3c7'], ['#7c3aed','#ede9fe'],
     3	  ['#db2777','#fce7f3'], ['#2563eb','#dbeafe'], ['#059669','#d1fae5'],
     4	  ['#dc2626','#fee2e2'], ['#7c2d12','#fed7aa'], ['#4338ca','#e0e7ff'],
     5	  ['#0369a1','#e0f2fe'],
     6	];
     7	
     8	function userColor(id) {
     9	  let hash = 0;
    10	  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    11	  return COLORS[Math.abs(hash) % COLORS.length];
    12	}
    13	
    14	function initials(name) {
    15	  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    16	}
    17	
    18	function avatarHTML(user, size='') {
    19	  const cls = size ? `avatar ${size}` : 'avatar';
    20	  if (user.avatarUrl) {
    21	    return `<div class="${cls}"><img src="${user.avatarUrl}" alt="${user.displayName}"></div>`;
    22	  }
    23	  const [fg, bg] = userColor(user.id);
    24	  return `<div class="${cls}" style="background:${bg};color:${fg}">${initials(user.displayName)}</div>`;
    25	}
    26	
    27	function chevronSVG() {
    28	  return `<svg class="chevron-right" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 4l4 4-4 4"/></svg>`;
    29	}
    30	
    31	function searchSVG() {
    32	  return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="5.5"/><path d="M12 12l4 4"/></svg>`;
    33	}
    34	
    35	const CONTACT_ICONS = {
    36	  phone: '📞', whatsapp: '💬', telegram: '✈️', email: '✉️',
    37	  signal: '🔒', snapchat: '👻', instagram: '📷', custom: '🔗'
    38	};
    39	
    40	function showToast(msg) {
    41	  const t = document.getElementById('toast');
    42	  t.textContent = msg;
    43	  t.classList.add('show');
    44	  setTimeout(() => t.classList.remove('show'), 2200);
    45	}
    46	
    47	function escHtml(s) {
    48	  const d = document.createElement('div');
    49	  d.textContent = s;
    50	  return d.innerHTML;
    51	}
```

Notable patterns:

- **\`userColor(id)\`** (line 8): Deterministic color assignment. It hashes the user's UUID to pick from 10 foreground/background pairs. The same user always gets the same color, even across renders.
- **\`avatarHTML(user, size)\`** (line 18): If the user has an uploaded avatar URL, it renders an \`<img>\`. Otherwise, it renders a colored circle with the user's initials. The \`size\` parameter maps to CSS classes (\`sm\`, \`lg\`, \`xl\`).
- **\`escHtml(s)\`** (line 47): XSS protection. Creates a throwaway \`<div>\`, sets its \`textContent\` (which escapes HTML entities), then reads back \`innerHTML\`. This is used everywhere user-controlled strings are interpolated into template literals.
- **\`showToast(msg)\`** (line 40): Shows a pill notification for 2.2 seconds using CSS class toggling.

## 9. Authentication Flow

The auth screen supports three paths: registration, magic link login, and the seed shortcut.

```bash
sed -n '389,430p' rolodex.html | cat -n
```

```output
     1	function renderAuth(mode = 'login') {
     2	  return `
     3	    <div class="auth-screen">
     4	      <div class="auth-logo">Rolodex</div>
     5	      <div class="auth-tagline">Your connection card</div>
     6	      <div class="auth-card" id="auth-card">
     7	        ${mode === 'register' ? `
     8	          <h2>Create account</h2>
     9	          <div class="form-field">
    10	            <label>Handle</label>
    11	            <input type="text" id="reg-handle" placeholder="jordanr" autocomplete="username">
    12	          </div>
    13	          <div class="form-field">
    14	            <label>Display Name</label>
    15	            <input type="text" id="reg-name" placeholder="Jordan Rivera">
    16	          </div>
    17	          <div class="form-field">
    18	            <label>Email</label>
    19	            <input type="email" id="reg-email" placeholder="jordan@hey.com">
    20	          </div>
    21	          <div id="auth-error" class="form-error"></div>
    22	          <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doRegister()">Sign Up</button>
    23	          <div class="auth-switch">Already have an account? <a onclick="renderApp('auth', 'login')">Log in</a></div>
    24	        ` : `
    25	          <h2>Welcome back</h2>
    26	          <div class="form-field">
    27	            <label>Email</label>
    28	            <input type="email" id="login-email" placeholder="jordan@hey.com">
    29	          </div>
    30	          <div id="auth-error" class="form-error"></div>
    31	          <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="doLogin()">Send Magic Link</button>
    32	          <div class="auth-divider">or</div>
    33	          <button class="btn btn-secondary" style="width:100%" onclick="renderApp('auth', 'register')">Create Account</button>
    34	          <div class="auth-switch">
    35	            Have a magic link token? <a onclick="promptMagicToken()">Enter token</a>
    36	          </div>
    37	        `}
    38	      </div>
    39	      <button class="seed-btn" onclick="doSeed()">Seed demo data &amp; log in</button>
    40	    </div>
    41	  `;
    42	}
```

The auth screen renders two modes via a ternary on line 7:

**Login mode** (default): Shows an email input and a "Send Magic Link" button. Since email sending is stubbed (it logs to the server console), there's also an "Enter token" link that opens a \`prompt()\` dialog where you can paste the token that was printed to the server's stdout.

**Register mode**: Shows handle, display name, and email fields. On submit, calls \`POST /auth/register\`, saves the returned tokens, and redirects to the profile view.

**Seed shortcut** (line 39): A dashed-border button below the card. Calls \`POST /seed\`, saves the returned tokens, and logs in as \`jordanr\`.

Here are the action handlers for registration and the seed button:

```bash
sed -n '432,461p' rolodex.html | cat -n
```

```output
     1	async function doRegister() {
     2	  const handle = document.getElementById('reg-handle')?.value?.trim();
     3	  const displayName = document.getElementById('reg-name')?.value?.trim();
     4	  const email = document.getElementById('reg-email')?.value?.trim();
     5	  const errEl = document.getElementById('auth-error');
     6	
     7	  if (!handle || !displayName || !email) {
     8	    errEl.textContent = 'All fields are required';
     9	    return;
    10	  }
    11	
    12	  try {
    13	    const res = await fetch(`${API}/auth/register`, {
    14	      method: 'POST',
    15	      headers: { 'Content-Type': 'application/json' },
    16	      body: JSON.stringify({ handle, displayName, email }),
    17	    });
    18	    const data = await res.json();
    19	    if (!res.ok) {
    20	      errEl.textContent = data.error || 'Registration failed';
    21	      return;
    22	    }
    23	    saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    24	    await loadMe();
    25	    renderApp('my-profile');
    26	    showToast('Account created!');
    27	  } catch (e) {
    28	    errEl.textContent = 'Network error';
    29	  }
    30	}
```

```bash
sed -n '512,527p' rolodex.html | cat -n
```

```output
     1	async function doSeed() {
     2	  try {
     3	    const res = await fetch(`${API}/seed`, { method: 'POST' });
     4	    const data = await res.json();
     5	    if (data.accessToken) {
     6	      saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
     7	      await loadMe();
     8	      renderApp('my-profile');
     9	      showToast(data.message || 'Demo data loaded!');
    10	    } else {
    11	      showToast(data.message || 'Seed complete');
    12	    }
    13	  } catch (e) {
    14	    showToast('Seed failed — is the server running?');
    15	  }
    16	}
```

Both functions follow the same pattern: call the API, check for errors, save tokens, load the user profile, and switch to the main view. Note that \`doRegister\` uses \`fetch\` directly instead of the \`api()\` wrapper — there's no token to attach yet since the user isn't logged in.

The \`doSeed\` function (line 1) does a simple POST with no body. The seed endpoint doesn't require auth. If it returns an \`accessToken\`, the user is logged in. If the database was already seeded, it still returns tokens (the idempotency path from the backend).

## 10. Loading the Current User

After a successful auth, the app needs to know who you are. The \`loadMe()\` function makes two API calls and merges them:

```bash
sed -n '532,566p' rolodex.html | cat -n
```

```output
     1	async function loadMe() {
     2	  const tokens = getTokens();
     3	  if (!tokens) return null;
     4	
     5	  try {
     6	    const res = await api('/users/me/contacts');
     7	    if (!res.ok) { clearTokens(); return null; }
     8	    const contactData = await res.json();
     9	
    10	    // We need to get our own profile. Decode JWT to get handle.
    11	    const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
    12	    const profileRes = await api(`/users/${payload.handle}`);
    13	    if (!profileRes.ok) { clearTokens(); return null; }
    14	    const profile = await profileRes.json();
    15	
    16	    ME = {
    17	      ...profile,
    18	      myContacts: contactData.contacts || [],
    19	    };
    20	    localStorage.setItem('rolodex_me', JSON.stringify(ME));
    21	
    22	    // Load notification count
    23	    try {
    24	      const notifRes = await api('/users/me/notifications?limit=1');
    25	      if (notifRes.ok) {
    26	        const notifData = await notifRes.json();
    27	        unreadNotifCount = notifData.unreadCount || 0;
    28	      }
    29	    } catch {}
    30	
    31	    return ME;
    32	  } catch {
    33	    return null;
    34	  }
    35	}
```

Three API calls build the \`ME\` object:

1. **\`GET /users/me/contacts\`** (line 6): Fetches the authenticated user's full contact links (including private ones, since you're the owner). This also serves as an auth check — if the token is invalid, this 401s and the function clears tokens.

2. **\`GET /users/:handle\`** (line 12): Fetches the profile (display name, bio, etc.). The handle is extracted from the JWT payload by base64-decoding the token's middle segment (\`atob(tokens.accessToken.split('.')[1])\`). This is a common shortcut — you decode the payload client-side without verification (the server already verified it when it accepted the request).

3. **\`GET /users/me/notifications?limit=1\`** (line 24): Just to get the \`unreadCount\` for the notification dot on the Settings tab.

The merged \`ME\` object gets the profile fields plus a \`myContacts\` array. It's cached to localStorage for quick hydration on page reload.

## 11. The My Profile View

The main screen shows your card — avatar, name, handle, bio, friend count, and contact links:

```bash
sed -n '607,665p' rolodex.html | cat -n
```

```output
     1	function renderMyProfile() {
     2	  if (!ME) return '<div class="loading-center"><div class="spinner"></div></div>';
     3	  const contactCount = ME.myContacts?.length || 0;
     4	  const friendCount = ME.contactLinks?.length !== undefined ? '...' : '...';
     5	
     6	  return `
     7	    <div class="view" id="view-my-profile">
     8	      <div class="top-bar">
     9	        <div class="top-bar-row">
    10	          <div>
    11	            <h1>Rolodex</h1>
    12	            <div class="subtitle">Your connection card</div>
    13	          </div>
    14	          <div style="display:flex;gap:8px">
    15	            <button class="icon-btn" onclick="openQR('${ME.handle}')" title="Share QR Code">
    16	              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    17	                <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="11" y="2" width="5" height="5" rx="1"/>
    18	                <rect x="2" y="11" width="5" height="5" rx="1"/><rect x="12" y="12" width="1.5" height="1.5"/>
    19	                <path d="M16 11h-2v3h3v-1.5M11 16h2"/>
    20	              </svg>
    21	            </button>
    22	            <button class="icon-btn" onclick="viewStack=[];renderApp('settings')" title="Settings">
    23	              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    24	                <circle cx="9" cy="9" r="2.5"/>
    25	                <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4"/>
    26	              </svg>
    27	            </button>
    28	          </div>
    29	        </div>
    30	      </div>
    31	      <div class="profile-header fade-in-up">
    32	        ${avatarHTML(ME, 'xl')}
    33	        <div class="profile-name">${escHtml(ME.displayName)}</div>
    34	        <div class="profile-handle">@${escHtml(ME.handle)}</div>
    35	        <div class="profile-bio">${escHtml(ME.bio || '')}</div>
    36	        <div class="profile-stats" id="my-stats">
    37	          <div class="stat"><div class="stat-num" id="my-friend-count"><div class="spinner" style="width:14px;height:14px;border-width:2px"></div></div><div class="stat-label">Friends</div></div>
    38	          <div class="stat"><div class="stat-num">${contactCount}</div><div class="stat-label">Links</div></div>
    39	        </div>
    40	      </div>
    41	      <div class="section-label">How to reach me</div>
    42	      <div class="contact-grid">
    43	        ${renderContactLinks(ME.myContacts)}
    44	      </div>
    45	    </div>
    46	  `;
    47	}
    48	
    49	// Load friend count asynchronously
    50	async function loadFriendCount() {
    51	  try {
    52	    const res = await api('/users/me/friends?limit=1');
    53	    if (res.ok) {
    54	      const data = await res.json();
    55	      const el = document.getElementById('my-friend-count');
    56	      if (el) el.textContent = data.total ?? data.friends?.length ?? 0;
    57	    }
    58	  } catch {}
    59	}
```

The profile view renders synchronously from the cached \`ME\` object — the avatar, name, handle, bio, and contact links are all available immediately. But the friend count isn't part of the profile response, so it renders a tiny spinner (line 37) as a placeholder and loads the count asynchronously.

\`loadFriendCount()\` (line 50) calls \`GET /users/me/friends?limit=1\` — it only needs the total, not the actual list. When the response arrives, it swaps the spinner for the number by targeting \`#my-friend-count\`.

This pattern — render a skeleton immediately, then fill in async data — repeats throughout the app. It keeps the UI responsive even on slow connections.

The \`renderContactLinks\` helper generates the clickable contact cards:

```bash
sed -n '571,589p' rolodex.html | cat -n
```

```output
     1	function renderContactLinks(contacts) {
     2	  if (!contacts || contacts.length === 0) {
     3	    return '<div class="empty-state" style="padding:20px"><p>No contact links shared</p></div>';
     4	  }
     5	  return contacts.map((c, i) => `
     6	    <a class="contact-link fade-in-up" style="animation-delay:${i * 0.04}s" href="#"
     7	       onclick="event.preventDefault(); copyContact('${escHtml(c.value)}', '${escHtml(c.label)}')">
     8	      <div class="contact-icon ${c.type}">${CONTACT_ICONS[c.type] || '🔗'}</div>
     9	      <div class="contact-text">
    10	        <div class="contact-label">${escHtml(c.label)}</div>
    11	        <div class="contact-value">${escHtml(c.value)}</div>
    12	      </div>
    13	      <svg width="16" height="16" fill="none" stroke="var(--stone-300)" stroke-width="2" stroke-linecap="round">
    14	        <rect x="3" y="5" width="7" height="9" rx="1.5"/>
    15	        <path d="M6 5V3.5A1.5 1.5 0 0 1 7.5 2h4A1.5 1.5 0 0 1 13 3.5v6a1.5 1.5 0 0 1-1.5 1.5H10"/>
    16	      </svg>
    17	    </a>
    18	  `).join('');
    19	}
```

Each contact renders as an \`<a>\` tag (for hover/active states) with a staggered \`fade-in-up\` animation — each card appears 40ms after the previous one (line 6). The icon is picked from the \`CONTACT_ICONS\` map based on type, falling back to a chain-link emoji for unknown types. The small clipboard SVG on the right is decorative — clicking anywhere on the card copies the contact value to the clipboard via \`copyContact()\`.

## 12. Friends List View

The friends view uses the async-loading pattern with a twist — client-side filtering:

```bash
sed -n '668,712p' rolodex.html | cat -n
```

```output
     1	async function renderFriendsAsync(searchTerm = '') {
     2	  const app = document.getElementById('app');
     3	  // Show loading first time
     4	  if (!friendsCache) {
     5	    try {
     6	      const res = await api('/users/me/friends?limit=100');
     7	      if (res.ok) friendsCache = await res.json();
     8	    } catch {}
     9	  }
    10	
    11	  if (!friendsCache) return;
    12	
    13	  let friends = friendsCache.friends || [];
    14	  if (searchTerm) {
    15	    const q = searchTerm.toLowerCase();
    16	    friends = friends.filter(u =>
    17	      u.displayName?.toLowerCase().includes(q) || u.handle?.toLowerCase().includes(q)
    18	    );
    19	  }
    20	
    21	  const content = document.getElementById('friends-list');
    22	  if (content) {
    23	    content.innerHTML = friends.length === 0
    24	      ? `<div class="empty-state"><p>${searchTerm ? `No friends match "${escHtml(searchTerm)}"` : 'No friends yet. Discover people!'}</p></div>`
    25	      : `<div class="section-label">All friends (${friendsCache.total || friends.length})</div>
    26	         ${friends.map(u => renderPersonRow(u)).join('')}`;
    27	  }
    28	}
    29	
    30	function renderFriends(searchTerm = '') {
    31	  return `
    32	    <div class="view" id="view-friends">
    33	      <div class="top-bar">
    34	        <h1>Friends</h1>
    35	        <div class="subtitle" id="friends-subtitle">Your connections</div>
    36	        <div class="search-wrap">
    37	          ${searchSVG()}
    38	          <input class="search-input" type="text" placeholder="Search friends..."
    39	            value="${escHtml(searchTerm)}" oninput="renderFriendsAsync(this.value)">
    40	        </div>
    41	      </div>
    42	      <div id="friends-list"><div class="loading-center"><div class="spinner"></div></div></div>
    43	    </div>
    44	  `;
    45	}
```

Two functions work together:

1. **\`renderFriends()\`** (line 30): Returns the static shell HTML — a top bar with a search input and an empty \`#friends-list\` div containing a spinner. The search input fires \`renderFriendsAsync(this.value)\` on every keystroke.

2. **\`renderFriendsAsync()\`** (line 1): The async worker. On first call, it fetches all friends (\`limit=100\`) and caches them in \`friendsCache\`. Subsequent calls (from typing in the search box) filter the cached list client-side without hitting the API again. This makes search feel instant.

The cache is invalidated (\`friendsCache = null\`) when:
- The user navigates to the Friends tab (the nav button's onclick does \`friendsCache=null\`)
- The user sends a friend request (in \`sendFriendRequest()\`)

## 13. Discover View

Discovery has two modes: suggestions (friend-of-friend recommendations) and search.

```bash
sed -n '715,762p' rolodex.html | cat -n
```

```output
     1	function renderDiscover(searchTerm = '') {
     2	  return `
     3	    <div class="view" id="view-discover">
     4	      <div class="top-bar">
     5	        <h1>Discover</h1>
     6	        <div class="subtitle">Find new connections</div>
     7	        <div class="search-wrap">
     8	          ${searchSVG()}
     9	          <input class="search-input" type="text" placeholder="Search by name..."
    10	            value="${escHtml(searchTerm)}" oninput="doDiscoverSearch(this.value)">
    11	        </div>
    12	      </div>
    13	      <div id="discover-content"><div class="loading-center"><div class="spinner"></div></div></div>
    14	    </div>
    15	  `;
    16	}
    17	
    18	let searchTimeout = null;
    19	function doDiscoverSearch(query) {
    20	  clearTimeout(searchTimeout);
    21	  if (!query || query.length < 2) {
    22	    loadDiscoverContent();
    23	    return;
    24	  }
    25	  searchTimeout = setTimeout(async () => {
    26	    const content = document.getElementById('discover-content');
    27	    if (!content) return;
    28	    content.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
    29	
    30	    try {
    31	      const res = await api(`/discover/search?q=${encodeURIComponent(query)}&limit=20`);
    32	      if (!res.ok) { content.innerHTML = '<div class="empty-state"><p>Search failed</p></div>'; return; }
    33	      const data = await res.json();
    34	
    35	      if (!data.results || data.results.length === 0) {
    36	        content.innerHTML = `<div class="empty-state"><p>No one found for "${escHtml(query)}"</p></div>`;
    37	        return;
    38	      }
    39	
    40	      content.innerHTML = `
    41	        <div class="section-label">${data.results.length} result${data.results.length !== 1 ? 's' : ''}</div>
    42	        ${data.results.map(u => renderPersonRow(u)).join('')}
    43	      `;
    44	    } catch {
    45	      content.innerHTML = '<div class="empty-state"><p>Search failed</p></div>';
    46	    }
    47	  }, 300);
    48	}
```

```bash
sed -n '764,801p' rolodex.html | cat -n
```

```output
     1	async function loadDiscoverContent() {
     2	  const content = document.getElementById('discover-content');
     3	  if (!content) return;
     4	
     5	  content.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
     6	
     7	  try {
     8	    const res = await api('/discover/suggestions?limit=20');
     9	    if (!res.ok) { content.innerHTML = '<div class="empty-state"><p>Could not load suggestions</p></div>'; return; }
    10	    const data = await res.json();
    11	    const suggestions = data.suggestions || [];
    12	
    13	    if (suggestions.length === 0) {
    14	      content.innerHTML = '<div class="empty-state"><p>No suggestions right now. Add more friends!</p></div>';
    15	      return;
    16	    }
    17	
    18	    content.innerHTML = `
    19	      <div class="section-label">People you may know</div>
    20	      <div class="discover-cards">
    21	        ${suggestions.map((s, i) => `
    22	          <div class="discover-card fade-in-up" style="animation-delay:${i * 0.05}s"
    23	               onclick="navigateTo('profile','${escHtml(s.handle)}')">
    24	            ${avatarHTML(s)}
    25	            <div class="person-info">
    26	              <div class="person-name">${escHtml(s.displayName)}</div>
    27	              <div class="person-handle">@${escHtml(s.handle)}</div>
    28	              <div class="person-mutual">${s.mutualFriendCount} mutual${s.mutualFriendCount !== 1 ? 's' : ''}</div>
    29	            </div>
    30	            ${chevronSVG()}
    31	          </div>
    32	        `).join('')}
    33	      </div>
    34	    `;
    35	  } catch {
    36	    content.innerHTML = '<div class="empty-state"><p>Could not load suggestions</p></div>';
    37	  }
    38	}
```

The discover view has a debounced search. Here's the flow:

1. **Default state**: \`loadDiscoverContent()\` fetches suggestions from \`GET /discover/suggestions?limit=20\`. The backend ranks non-friends by mutual friend count, so the most "connected" strangers appear first. Each suggestion card shows the mutual count in teal.

2. **As the user types**: \`doDiscoverSearch()\` uses a 300ms debounce timer (line 20–25). Queries under 2 characters fall back to suggestions. Longer queries hit \`GET /discover/search?q=...\`. Unlike the friends search, discover search always goes to the API because it searches across all users, not a cached list.

3. **Results**: Both paths render into the same \`#discover-content\` container, showing a spinner during loading.

The staggered \`fade-in-up\` animation (line 22) applies to suggestion cards with a 50ms delay between each — slightly slower than the contact links (40ms) to create a cascading reveal effect.

## 14. Profile Detail View

When you tap on a person (friend, suggestion, or search result), the app navigates to a detail view:

```bash
sed -n '804,903p' rolodex.html | cat -n
```

```output
     1	function renderProfile(handle) {
     2	  return `
     3	    <div class="view" id="view-profile">
     4	      <div class="top-bar">
     5	        <div class="top-bar-row">
     6	          <button class="back-btn" onclick="goBack()">
     7	            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4L5 9l6 5"/></svg>
     8	            Back
     9	          </button>
    10	          <button class="icon-btn" onclick="openQR('${escHtml(handle)}')" title="Share profile">
    11	            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    12	              <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="11" y="2" width="5" height="5" rx="1"/>
    13	              <rect x="2" y="11" width="5" height="5" rx="1"/><rect x="12" y="12" width="1.5" height="1.5"/>
    14	              <path d="M16 11h-2v3h3v-1.5M11 16h2"/>
    15	            </svg>
    16	          </button>
    17	        </div>
    18	      </div>
    19	      <div id="profile-content"><div class="loading-center"><div class="spinner"></div></div></div>
    20	    </div>
    21	  `;
    22	}
    23	
    24	async function loadProfileContent(handle) {
    25	  const content = document.getElementById('profile-content');
    26	  if (!content) return;
    27	
    28	  try {
    29	    const res = await api(`/users/${handle}`);
    30	    if (!res.ok) {
    31	      content.innerHTML = '<div class="empty-state"><p>User not found</p></div>';
    32	      return;
    33	    }
    34	    const user = await res.json();
    35	    const isMe = ME && user.id === ME.id;
    36	    const isFriend = user.relationship === 'accepted';
    37	    const isPending = user.relationship === 'pending';
    38	
    39	    let friendsHtml = '';
    40	    try {
    41	      const fRes = await api(`/users/${handle}/friends?limit=6`);
    42	      if (fRes.ok) {
    43	        const fData = await fRes.json();
    44	        if (fData.friends && fData.friends.length > 0) {
    45	          friendsHtml = `
    46	            <div class="section-label">Their Friends</div>
    47	            ${fData.friends.slice(0, 6).map(f => renderPersonRow(f)).join('')}
    48	          `;
    49	        }
    50	      }
    51	    } catch {}
    52	
    53	    let mutualsHtml = '';
    54	    if (!isMe && user.mutualFriendCount > 0) {
    55	      try {
    56	        const mRes = await api(`/users/${handle}/mutuals`);
    57	        if (mRes.ok) {
    58	          const mData = await mRes.json();
    59	          if (mData.mutuals && mData.mutuals.length > 0) {
    60	            mutualsHtml = `
    61	              <div class="section-label">Mutual Friends</div>
    62	              ${mData.mutuals.map(m => renderPersonRow(m)).join('')}
    63	            `;
    64	          }
    65	        }
    66	      } catch {}
    67	    }
    68	
    69	    content.innerHTML = `
    70	      <div class="profile-header fade-in-up">
    71	        ${avatarHTML(user, 'xl')}
    72	        <div class="profile-name">${escHtml(user.displayName)}</div>
    73	        <div class="profile-handle">@${escHtml(user.handle)}</div>
    74	        ${isFriend ? '<div class="friend-badge is-friend">✓ Friends</div>' :
    75	          isPending ? '<div class="friend-badge pending">⏳ Pending</div>' :
    76	          user.mutualFriendCount > 0 ? `<div class="friend-badge mutual">${user.mutualFriendCount} mutual friend${user.mutualFriendCount > 1 ? 's' : ''}</div>` : ''}
    77	        <div class="profile-bio">${escHtml(user.bio || '')}</div>
    78	        <div class="profile-stats">
    79	          <div class="stat"><div class="stat-num">${user.contactLinks?.length || 0}</div><div class="stat-label">Links</div></div>
    80	        </div>
    81	      </div>
    82	      ${!isMe && !isFriend && !isPending ? `
    83	        <div class="profile-actions">
    84	          <button class="btn btn-primary" id="add-friend-btn" onclick="sendFriendRequest('${user.id}', this)">
    85	            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
    86	            Add Friend
    87	          </button>
    88	        </div>
    89	      ` : ''}
    90	      <div class="section-label" style="margin-top:8px">Contact</div>
    91	      <div class="contact-grid">
    92	        ${renderContactLinks(user.contactLinks)}
    93	      </div>
    94	      ${mutualsHtml}
    95	      ${friendsHtml}
    96	    `;
    97	  } catch {
    98	    content.innerHTML = '<div class="empty-state"><p>Failed to load profile</p></div>';
    99	  }
   100	}
```

The profile detail view makes up to three API calls:

1. **\`GET /users/:handle\`** (line 29): The profile, including contact links filtered by the backend's visibility service. If you're friends, you see \`friends_only\` links. If not, you only see \`everyone\` links.

2. **\`GET /users/:handle/friends?limit=6\`** (line 41): Their friend list (up to 6 shown). Each renders as a tappable \`person-row\` that navigates deeper into the view stack.

3. **\`GET /users/:handle/mutuals\`** (line 56): Only fetched if \`mutualFriendCount > 0\` and you're not viewing your own profile. Shows shared connections.

The rendering logic on lines 74–89 shows relationship-aware badges and actions:
- **Friends**: Green "✓ Friends" badge
- **Pending request**: Gray "⏳ Pending" badge
- **Strangers with mutuals**: Amber badge showing mutual count
- **Non-friends** (not pending): An "Add Friend" button that calls \`sendFriendRequest()\`

The \`user.contactLinks\` array comes from the backend already filtered by visibility — the frontend doesn't need to know about visibility rules at all.

## 15. Navigation and Routing

The app uses a simple view-switching router:

```bash
sed -n '1013,1097p' rolodex.html | cat -n
```

```output
     1	function renderApp(view, searchTerm = '') {
     2	  if (view) currentView = view;
     3	  const app = document.getElementById('app');
     4	
     5	  // Auth check
     6	  const tokens = getTokens();
     7	  if (!tokens && currentView !== 'auth') {
     8	    currentView = 'auth';
     9	  }
    10	
    11	  let html = '';
    12	  switch (currentView) {
    13	    case 'auth':       html = renderAuth(searchTerm || 'login'); break;
    14	    case 'my-profile': html = renderMyProfile(); break;
    15	    case 'friends':    html = renderFriends(searchTerm); break;
    16	    case 'discover':   html = renderDiscover(searchTerm); break;
    17	    case 'settings':   html = renderSettings(); break;
    18	    case 'profile':    html = renderProfile(viewStack[viewStack.length - 1]); break;
    19	    default:           html = renderMyProfile(); break;
    20	  }
    21	
    22	  // Bottom nav (only when logged in and not auth)
    23	  if (currentView !== 'auth') {
    24	    html += `
    25	      <nav class="bottom-nav">
    26	        <button class="nav-btn ${currentView === 'my-profile' ? 'active' : ''}" onclick="viewStack=[];renderApp('my-profile')">
    27	          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    28	            <circle cx="11" cy="8" r="4"/><path d="M3 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
    29	          </svg>
    30	          Me
    31	        </button>
    32	        <button class="nav-btn ${currentView === 'friends' ? 'active' : ''}" onclick="viewStack=[];friendsCache=null;renderApp('friends')">
    33	          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    34	            <circle cx="8" cy="7" r="3.5"/><circle cx="16" cy="9" r="2.5"/>
    35	            <path d="M1 19c0-3.9 3.1-7 7-7 1.6 0 3 .5 4.2 1.4M13 19c0-2.8 1.8-5 4-5s4 2.2 4 5"/>
    36	          </svg>
    37	          Friends
    38	        </button>
    39	        <button class="nav-btn ${currentView === 'discover' ? 'active' : ''}" onclick="viewStack=[];renderApp('discover')">
    40	          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    41	            <circle cx="11" cy="11" r="7.5"/><path d="M16 16l4 4"/>
    42	            <circle cx="11" cy="9" r="2.5"/><path d="M7 15c0-2.2 1.8-4 4-4s4 1.8 4 4"/>
    43	          </svg>
    44	          Discover
    45	        </button>
    46	        <button class="nav-btn ${currentView === 'settings' ? 'active' : ''}" onclick="viewStack=[];renderApp('settings')">
    47	          ${unreadNotifCount > 0 ? '<div class="notif-dot"></div>' : ''}
    48	          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    49	            <circle cx="11" cy="11" r="3"/>
    50	            <path d="M11 2v3M11 17v3M2 11h3M17 11h3M4.9 4.9l2.1 2.1M15 15l2.1 2.1M4.9 17.1l2.1-2.1M15 7l2.1-2.1"/>
    51	          </svg>
    52	          Settings
    53	        </button>
    54	      </nav>
    55	    `;
    56	  }
    57	
    58	  app.innerHTML = html;
    59	
    60	  // Post-render hooks
    61	  if (currentView === 'my-profile') loadFriendCount();
    62	  if (currentView === 'friends') renderFriendsAsync(searchTerm);
    63	  if (currentView === 'discover') loadDiscoverContent();
    64	  if (currentView === 'profile') loadProfileContent(viewStack[viewStack.length - 1]);
    65	
    66	  // Restore search focus
    67	  if (searchTerm && currentView !== 'auth') {
    68	    const input = app.querySelector('.search-input');
    69	    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    70	  }
    71	}
    72	
    73	function navigateTo(view, handle) {
    74	  if (handle) viewStack.push(handle);
    75	  renderApp(view);
    76	}
    77	
    78	function goBack() {
    79	  viewStack.pop();
    80	  if (viewStack.length > 0) {
    81	    renderApp('profile');
    82	  } else {
    83	    renderApp('friends');
    84	  }
    85	}
```

\`renderApp()\` is the central router. Here's how it works:

1. **Auth guard** (line 6): If there are no tokens and we're not already on the auth screen, force redirect to auth.

2. **View switch** (line 12): A switch statement maps \`currentView\` to a render function. Each returns an HTML string.

3. **Bottom nav** (line 23): Appended to every non-auth view. The active tab gets a teal highlight via the \`.active\` class. Each nav button clears the view stack and resets caches before switching views. The Settings button conditionally renders a red notification dot (line 47).

4. **DOM update** (line 58): \`app.innerHTML = html\` replaces the entire app content. This is the simplest possible rendering strategy — no virtual DOM, no diffing, just a full replace.

5. **Post-render hooks** (line 60–64): After the DOM is updated, async data loaders fire for the current view. These fill in content that wasn't available during the synchronous render.

6. **Search focus restoration** (line 67): If the user was typing in a search box, the input is refocused and the cursor is placed at the end.

The navigation functions are straightforward:
- **\`navigateTo(view, handle)\`**: Pushes a handle onto the view stack and renders. Used when tapping a person row.
- **\`goBack()\`**: Pops the stack. If there are more handles, shows the previous profile. If empty, returns to the friends list.

## 16. Settings View

Settings is a menu-driven view with grouped rows:

```bash
sed -n '906,1008p' rolodex.html | cat -n
```

```output
     1	function renderSettings() {
     2	  if (!ME) return '<div class="loading-center"><div class="spinner"></div></div>';
     3	
     4	  return `
     5	    <div class="view" id="view-settings">
     6	      <div class="top-bar">
     7	        <h1>Settings</h1>
     8	        <div class="subtitle">Profile & preferences</div>
     9	      </div>
    10	
    11	      <div class="section-label">Profile</div>
    12	      <div class="profile-edit-card" onclick="viewStack=[];renderApp('my-profile')">
    13	        ${avatarHTML(ME, 'lg')}
    14	        <div class="profile-edit-info">
    15	          <div class="profile-edit-name">${escHtml(ME.displayName)}</div>
    16	          <div class="profile-edit-handle">@${escHtml(ME.handle)}</div>
    17	          <div class="profile-edit-label">View your card →</div>
    18	        </div>
    19	      </div>
    20	
    21	      <div class="section-label">Account</div>
    22	      <div class="settings-section">
    23	        <div class="settings-group">
    24	          <div class="settings-row" onclick="editProfile()">
    25	            <div class="settings-icon teal">✏️</div>
    26	            <div class="settings-text">
    27	              <div class="settings-label">Edit Profile</div>
    28	              <div class="settings-desc">Name, bio</div>
    29	            </div>
    30	            ${chevronSVG()}
    31	          </div>
    32	          <div class="settings-row" onclick="openQR('${ME.handle}')">
    33	            <div class="settings-icon violet">📲</div>
    34	            <div class="settings-text">
    35	              <div class="settings-label">My QR Code</div>
    36	              <div class="settings-desc">Share your profile card</div>
    37	            </div>
    38	            ${chevronSVG()}
    39	          </div>
    40	        </div>
    41	      </div>
    42	
    43	      <div class="section-label">Notifications</div>
    44	      <div class="settings-section">
    45	        <div class="settings-group">
    46	          <div class="settings-row" onclick="viewStack=[];loadNotificationsView()">
    47	            <div class="settings-icon amber">🔔</div>
    48	            <div class="settings-text">
    49	              <div class="settings-label">Notifications</div>
    50	              <div class="settings-desc">${unreadNotifCount > 0 ? `${unreadNotifCount} unread` : 'All caught up'}</div>
    51	            </div>
    52	            ${chevronSVG()}
    53	          </div>
    54	        </div>
    55	      </div>
    56	
    57	      <div class="section-label">Data</div>
    58	      <div class="settings-section">
    59	        <div class="settings-group">
    60	          <div class="settings-row" onclick="exportVcf()">
    61	            <div class="settings-icon amber">📤</div>
    62	            <div class="settings-text">
    63	              <div class="settings-label">Export as vCard</div>
    64	              <div class="settings-desc">Download friends as .vcf</div>
    65	            </div>
    66	            ${chevronSVG()}
    67	          </div>
    68	          <div class="settings-row" onclick="exportCsv()">
    69	            <div class="settings-icon teal">📋</div>
    70	            <div class="settings-text">
    71	              <div class="settings-label">Export as CSV</div>
    72	              <div class="settings-desc">Download friends as .csv</div>
    73	            </div>
    74	            ${chevronSVG()}
    75	          </div>
    76	        </div>
    77	      </div>
    78	
    79	      <div class="section-label">Privacy</div>
    80	      <div class="settings-section">
    81	        <div class="settings-group">
    82	          <div class="settings-row" onclick="togglePrivacy()">
    83	            <div class="settings-icon rose">🔒</div>
    84	            <div class="settings-text">
    85	              <div class="settings-label">Profile Visibility</div>
    86	              <div class="settings-desc" id="privacy-desc">${ME.isPublic ? 'Public — anyone can see your friend list' : 'Private — only friends see your friend list'}</div>
    87	            </div>
    88	            ${chevronSVG()}
    89	          </div>
    90	        </div>
    91	      </div>
    92	
    93	      <div class="settings-section" style="margin-top:16px;margin-bottom:40px;text-align:center">
    94	        <button class="btn btn-secondary" style="width:100%;color:var(--rose-500);border-color:var(--rose-400)" onclick="doSignOut()">
    95	          Sign Out
    96	        </button>
    97	        <div style="margin-top:16px;font-size:0.72rem;color:var(--stone-400)">
    98	          Rolodex v0.1.0 · Backed by a real API
    99	        </div>
   100	      </div>
   101	    </div>
   102	  `;
   103	}
```

Settings is organized into five sections:

1. **Profile card** (line 12): Shows the user's avatar and name. Tapping it navigates to the My Profile view.
2. **Account** (line 21): Edit Profile (name/bio via \`prompt()\` dialogs) and QR code sharing.
3. **Notifications** (line 43): Shows unread count; tapping opens a sub-view.
4. **Data** (line 57): Export contacts as vCard or CSV.
5. **Privacy** (line 79): Toggle profile visibility between public and private.

The sign-out button (line 94) is styled with rose/red colors to signal danger. Below it, a version string confirms you're on the API-backed version.

## 17. Actions — QR Codes, Exports, and Profile Editing

The action functions connect UI interactions to API endpoints:

```bash
sed -n '1126,1147p' rolodex.html | cat -n
```

```output
     1	async function openQR(handle) {
     2	  document.getElementById('qr-title').textContent = 'Share Profile';
     3	  document.getElementById('qr-sub').textContent = `Scan to connect with @${handle}`;
     4	  document.getElementById('qr-box').innerHTML = '<div class="spinner"></div>';
     5	  document.getElementById('qr-modal').classList.add('open');
     6	
     7	  try {
     8	    const res = await api(`/qr/${handle}/data-url`);
     9	    if (res.ok) {
    10	      const data = await res.json();
    11	      document.getElementById('qr-box').innerHTML = `<img src="${data.dataUrl}" alt="QR Code for @${handle}">`;
    12	    } else {
    13	      document.getElementById('qr-box').innerHTML = '<p style="color:var(--stone-400);font-size:0.82rem">QR generation failed</p>';
    14	    }
    15	  } catch {
    16	    document.getElementById('qr-box').innerHTML = '<p style="color:var(--stone-400);font-size:0.82rem">QR generation failed</p>';
    17	  }
    18	}
    19	
    20	function closeQR() {
    21	  document.getElementById('qr-modal').classList.remove('open');
    22	}
```

\`openQR()\` shows the modal immediately with a spinner, then fetches the QR code from \`GET /qr/:handle/data-url\`. The backend generates a PNG QR code encoding \`http://localhost:3000/@{handle}\` and returns it as a base64 data URL. The frontend sets this as the \`src\` of an \`<img>\` tag — no canvas manipulation needed. The modal is closed by removing the \`.open\` class.

Export functions download files using the Blob API:

```bash
sed -n '1152,1180p' rolodex.html | cat -n
```

```output
     1	async function exportVcf() {
     2	  try {
     3	    const res = await api('/export/vcf');
     4	    if (!res.ok) { showToast('Export failed'); return; }
     5	    const text = await res.text();
     6	    const blob = new Blob([text], { type: 'text/vcard' });
     7	    const url = URL.createObjectURL(blob);
     8	    const a = document.createElement('a');
     9	    a.href = url; a.download = 'rolodex-contacts.vcf';
    10	    a.click();
    11	    URL.revokeObjectURL(url);
    12	    showToast('Exported contacts as .vcf');
    13	  } catch { showToast('Export failed'); }
    14	}
    15	
    16	async function exportCsv() {
    17	  try {
    18	    const res = await api('/export/csv');
    19	    if (!res.ok) { showToast('Export failed'); return; }
    20	    const text = await res.text();
    21	    const blob = new Blob([text], { type: 'text/csv' });
    22	    const url = URL.createObjectURL(blob);
    23	    const a = document.createElement('a');
    24	    a.href = url; a.download = 'rolodex-contacts.csv';
    25	    a.click();
    26	    URL.revokeObjectURL(url);
    27	    showToast('Exported contacts as .csv');
    28	  } catch { showToast('Export failed'); }
    29	}
```

Both export functions follow the same pattern:
1. Fetch the export endpoint (\`/export/vcf\` or \`/export/csv\`)
2. Read the response as text
3. Create a Blob with the appropriate MIME type
4. Generate an Object URL and trigger a download by clicking a dynamically created \`<a>\` element
5. Revoke the Object URL to free memory
6. Show a toast confirmation

The privacy toggle and profile editor:

```bash
sed -n '1182,1215p' rolodex.html | cat -n
```

```output
     1	async function togglePrivacy() {
     2	  try {
     3	    const res = await api('/settings', {
     4	      method: 'PATCH',
     5	      body: { isPublic: !ME.isPublic },
     6	    });
     7	    if (res.ok) {
     8	      ME.isPublic = !ME.isPublic;
     9	      const desc = document.getElementById('privacy-desc');
    10	      if (desc) desc.textContent = ME.isPublic
    11	        ? 'Public — anyone can see your friend list'
    12	        : 'Private — only friends see your friend list';
    13	      showToast(ME.isPublic ? 'Profile set to public' : 'Profile set to private');
    14	    }
    15	  } catch { showToast('Failed to update'); }
    16	}
    17	
    18	function editProfile() {
    19	  const name = prompt('Display name:', ME.displayName);
    20	  if (name === null) return;
    21	  const bio = prompt('Bio:', ME.bio || '');
    22	  if (bio === null) return;
    23	
    24	  api('/users/me', {
    25	    method: 'PATCH',
    26	    body: { displayName: name.trim() || ME.displayName, bio: bio.trim() },
    27	  }).then(async res => {
    28	    if (res.ok) {
    29	      await loadMe();
    30	      renderApp('settings');
    31	      showToast('Profile updated!');
    32	    } else { showToast('Update failed'); }
    33	  }).catch(() => showToast('Update failed'));
    34	}
```

\`togglePrivacy()\` sends \`PATCH /settings\` with the inverted \`isPublic\` value. On success, it updates the in-memory \`ME\` object and directly mutates the description text — no full re-render needed.

\`editProfile()\` uses the browser's native \`prompt()\` dialogs for name and bio input. This is intentionally simple — no inline editing UI was needed for this iteration. After a successful \`PATCH /users/me\`, it reloads the full user profile and re-renders the settings view.

## 18. Notifications Sub-View

Notifications get their own sub-view accessible from Settings:

```bash
sed -n '1217,1284p' rolodex.html | cat -n
```

```output
     1	async function loadNotificationsView() {
     2	  currentView = 'settings';
     3	  const app = document.getElementById('app');
     4	  app.innerHTML = `
     5	    <div class="view">
     6	      <div class="top-bar">
     7	        <div class="top-bar-row">
     8	          <button class="back-btn" onclick="renderApp('settings')">
     9	            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4L5 9l6 5"/></svg>
    10	            Back
    11	          </button>
    12	          <button class="btn btn-sm btn-secondary" onclick="markAllRead()">Mark all read</button>
    13	        </div>
    14	        <h1 style="margin-top:8px">Notifications</h1>
    15	      </div>
    16	      <div id="notif-list"><div class="loading-center"><div class="spinner"></div></div></div>
    17	    </div>
    18	    <nav class="bottom-nav">
    19	      <button class="nav-btn" onclick="viewStack=[];renderApp('my-profile')"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="8" r="4"/><path d="M3 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>Me</button>
    20	      <button class="nav-btn" onclick="viewStack=[];friendsCache=null;renderApp('friends')"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="7" r="3.5"/><circle cx="16" cy="9" r="2.5"/><path d="M1 19c0-3.9 3.1-7 7-7 1.6 0 3 .5 4.2 1.4M13 19c0-2.8 1.8-5 4-5s4 2.2 4 5"/></svg>Friends</button>
    21	      <button class="nav-btn" onclick="viewStack=[];renderApp('discover')"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7.5"/><path d="M16 16l4 4"/><circle cx="11" cy="9" r="2.5"/><path d="M7 15c0-2.2 1.8-4 4-4s4 1.8 4 4"/></svg>Discover</button>
    22	      <button class="nav-btn active" onclick="viewStack=[];renderApp('settings')"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="3"/><path d="M11 2v3M11 17v3M2 11h3M17 11h3M4.9 4.9l2.1 2.1M15 15l2.1 2.1M4.9 17.1l2.1-2.1M15 7l2.1-2.1"/></svg>Settings</button>
    23	    </nav>
    24	  `;
    25	
    26	  try {
    27	    const res = await api('/users/me/notifications?limit=50');
    28	    if (!res.ok) return;
    29	    const data = await res.json();
    30	    const list = document.getElementById('notif-list');
    31	    if (!list) return;
    32	
    33	    if (!data.notifications || data.notifications.length === 0) {
    34	      list.innerHTML = '<div class="empty-state"><p>No notifications yet</p></div>';
    35	      return;
    36	    }
    37	
    38	    list.innerHTML = data.notifications.map(n => `
    39	      <div class="person-row" style="${n.read ? 'opacity:0.6' : ''}" onclick="markNotifRead('${n.id}', this)">
    40	        <div class="settings-icon ${n.type === 'friend_request' ? 'blue' : 'teal'}" style="width:40px;height:40px;border-radius:50%">
    41	          ${n.type === 'friend_request' ? '👋' : '✓'}
    42	        </div>
    43	        <div class="person-info">
    44	          <div class="person-name" style="font-size:0.88rem">${escHtml(n.message)}</div>
    45	          <div class="person-handle">${new Date(n.createdAt).toLocaleDateString()}</div>
    46	        </div>
    47	        ${n.read ? '' : '<div style="width:8px;height:8px;border-radius:50%;background:var(--teal-500);flex-shrink:0"></div>'}
    48	      </div>
    49	    `).join('');
    50	  } catch {}
    51	}
    52	
    53	async function markNotifRead(id, el) {
    54	  try {
    55	    await api(`/users/me/notifications/${id}/read`, { method: 'POST' });
    56	    if (el) el.style.opacity = '0.6';
    57	    unreadNotifCount = Math.max(0, unreadNotifCount - 1);
    58	  } catch {}
    59	}
    60	
    61	async function markAllRead() {
    62	  try {
    63	    await api('/users/me/notifications/read-all', { method: 'POST' });
    64	    unreadNotifCount = 0;
    65	    showToast('All notifications marked as read');
    66	    loadNotificationsView();
    67	  } catch {}
    68	}
```

The notifications view is special — it doesn't go through \`renderApp()\`. Instead, \`loadNotificationsView()\` directly sets \`app.innerHTML\` with both the view content and a duplicate bottom nav (lines 18–23). This is a pragmatic shortcut: since notifications is a sub-view of Settings, it keeps the Settings tab highlighted.

Each notification renders as a \`person-row\` with:
- A colored circle icon (blue for friend requests, teal for acceptances)
- The notification message (escaped HTML)
- A date formatted by the browser's locale
- A teal dot for unread items (line 47)

Clicking a notification marks it as read (line 53) — the UI immediately dims the row (opacity 0.6) and decrements the unread counter. "Mark all read" (line 61) bulk-updates and refreshes the view.

## 19. Friend Request Action

Sending a friend request from a profile detail view:

```bash
sed -n '1107,1124p' rolodex.html | cat -n
```

```output
     1	async function sendFriendRequest(userId, btn) {
     2	  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Sending...'; }
     3	  try {
     4	    const res = await api(`/friends/request/${userId}`, { method: 'POST' });
     5	    const data = await res.json();
     6	    if (res.ok) {
     7	      showToast('Friend request sent!');
     8	      if (btn) btn.innerHTML = '⏳ Pending';
     9	      friendsCache = null; // Invalidate
    10	    } else {
    11	      showToast(data.error || 'Failed to send request');
    12	      if (btn) { btn.disabled = false; btn.innerHTML = 'Add Friend'; }
    13	    }
    14	  } catch {
    15	    showToast('Network error');
    16	    if (btn) { btn.disabled = false; btn.innerHTML = 'Add Friend'; }
    17	  }
    18	}
```

The friend request flow shows good optimistic UI patterns:

1. **Immediate feedback**: The button is disabled and shows a spinner + "Sending..." (line 2) before the API call starts.
2. **Success state**: The button text changes to "⏳ Pending" (line 8) — it stays disabled, preventing double-sends.
3. **Cache invalidation**: \`friendsCache = null\` (line 9) ensures the next visit to the Friends tab fetches fresh data.
4. **Error recovery**: If the request fails, the button reverts to "Add Friend" and re-enables (line 12).

## 20. Sign Out

The logout flow is synchronous and immediate:

```bash
sed -n '1286,1292p' rolodex.html | cat -n
```

```output
     1	function doSignOut() {
     2	  clearTokens();
     3	  ME = null;
     4	  friendsCache = null;
     5	  renderApp('auth');
     6	  showToast('Signed out');
     7	}
```

Sign out is client-side only — there's no server-side session to invalidate. It clears localStorage tokens, nulls out the in-memory user and caches, and re-renders the auth screen. The JWT tokens will expire on their own (15 minutes for access, 7 days for refresh).

## 21. Initialization

The app boots with an immediately-invoked async function:

```bash
sed -n '1294,1312p' rolodex.html | cat -n
```

```output
     1	// ═══════════════════════════════════════════
     2	//  INIT
     3	// ═══════════════════════════════════════════
     4	(async function init() {
     5	  const tokens = getTokens();
     6	  if (tokens) {
     7	    const me = await loadMe();
     8	    if (me) {
     9	      renderApp('my-profile');
    10	      return;
    11	    }
    12	  }
    13	  renderApp('auth');
    14	})();
    15	</script>
    16	
    17	</body>
    18	</html>
```

The IIFE on line 4 runs immediately when the page loads:

1. Check localStorage for existing tokens (line 5)
2. If tokens exist, try to load the user profile (line 7). This validates the tokens against the server.
3. If the profile loads successfully, go to the My Profile view (line 9)
4. If no tokens or the token is invalid, show the auth screen (line 13)

This means: if you've previously logged in and your refresh token is still valid, the app drops you straight into your profile on page load — no login needed.

## 22. How the Alpha and API Frontend Compare

Let's compare the two frontends at a high level:

```bash
echo '--- rolodex-alpha.html (prototype) ---' && wc -l rolodex-alpha.html && echo '' && echo '--- rolodex.html (API-backed) ---' && wc -l rolodex.html
```

```output
--- rolodex-alpha.html (prototype) ---
1391 rolodex-alpha.html

--- rolodex.html (API-backed) ---
1311 rolodex.html
```

```bash
echo 'Alpha JS functions:' && grep -c 'function ' rolodex-alpha.html && echo 'API JS functions:' && grep -c 'function ' rolodex.html
```

```output
Alpha JS functions:
27
API JS functions:
46
```

```bash
echo 'Alpha: references to USERS object:' && grep -c 'USERS\[' rolodex-alpha.html; echo 'API: calls to api() wrapper:' && grep -c 'await api(' rolodex.html; echo 'Alpha: async functions:' && (grep -c 'async function' rolodex-alpha.html || echo 0); echo 'API: async functions:' && grep -c 'async function' rolodex.html
```

```output
Alpha: references to USERS object:
14
API: calls to api() wrapper:
18
Alpha: async functions:
0
0
API: async functions:
19
```

The API-backed frontend is actually ~80 lines shorter despite having 19 more functions. This is because the alpha embeds all data inline as a \`USERS\` JavaScript object (~160 lines of hardcoded data), while the API frontend fetches everything from endpoints and has no embedded data at all.

The key architectural shift: the alpha has **zero async functions** — everything is synchronous reads from an in-memory object. The API frontend has **19 async functions** because every data access now involves a network call. The async loading pattern (render skeleton with spinner, then fill in real data) is the biggest difference in how the two versions feel to read and maintain.

## 23. Request Flow Summary

To put it all together, here's the lifecycle of a typical user session:

1. **Page load** → \`init()\` checks localStorage for tokens → if found, calls \`loadMe()\` → renders My Profile
2. **First visit** → No tokens → renders auth screen → user clicks "Seed demo data" → \`POST /seed\` → tokens saved → \`loadMe()\` → My Profile
3. **My Profile** → Synchronous render from \`ME\` cache → async \`loadFriendCount()\` fills in friend count
4. **Friends tab** → Shell with spinner → \`renderFriendsAsync()\` fetches \`GET /users/me/friends\` → caches result → renders list → typing in search filters locally
5. **Discover tab** → Shell with spinner → \`loadDiscoverContent()\` fetches \`GET /discover/suggestions\` → renders cards → typing triggers debounced \`GET /discover/search\`
6. **Tap a person** → \`navigateTo('profile', handle)\` → pushes to viewStack → shell with spinner → \`loadProfileContent()\` fetches profile + friends + mutuals → renders with relationship badges
7. **Add Friend** → \`POST /friends/request/:id\` → button changes to "Pending" → friends cache invalidated
8. **Settings** → Synchronous render from \`ME\` → notifications count from earlier \`loadMe()\` call
9. **Export** → \`GET /export/vcf\` or \`/export/csv\` → Blob download
10. **Sign out** → Clear localStorage → render auth

## 24. API Endpoints Used by the Frontend

A full inventory of every backend endpoint the frontend calls:

```bash
grep -noE '(fetch|api)\([^)]*\)' rolodex.html | sed 's/^/  /' | sort -t: -k2 -n
```

```output
  1110:api(`/friends/request/${userId}`, { method: 'POST' })
  1133:api(`/qr/${handle}/data-url`)
  1154:api('/export/vcf')
  1169:api('/export/csv')
  1243:api('/users/me/notifications?limit=50')
  1271:api(`/users/me/notifications/${id}/read`, { method: 'POST' })
  1279:api('/users/me/notifications/read-all', { method: 'POST' })
  281:api(path, opts = {})
  294:fetch(`${API}${path}`, { ...opts, headers })
  307:fetch(`${API}${path}`, { ...opts, headers })
  497:fetch(`${API}/auth/magic-link/verify?token=${encodeURIComponent(token)
  514:fetch(`${API}/seed`, { method: 'POST' })
  537:api('/users/me/contacts')
  543:api(`/users/${payload.handle}`)
  555:api('/users/me/notifications?limit=1')
  658:api('/users/me/friends?limit=1')
  673:api('/users/me/friends?limit=100')
  745:api(`/discover/search?q=${encodeURIComponent(query)
  771:api('/discover/suggestions?limit=20')
  832:api(`/users/${handle}`)
  844:api(`/users/${handle}/friends?limit=6`)
  859:api(`/users/${handle}/mutuals`)
```

Organized by category:

| Category | Method | Endpoint | Used by |
|----------|--------|----------|---------|
| **Auth** | POST | \`/auth/register\` | \`doRegister()\` |
| | POST | \`/auth/login\` | \`doLogin()\` |
| | GET | \`/auth/magic-link/verify\` | \`verifyMagicToken()\` |
| | POST | \`/auth/refresh\` | \`api()\` (auto-refresh) |
| **Seed** | POST | \`/seed\` | \`doSeed()\` |
| **Profile** | GET | \`/users/:handle\` | \`loadMe()\`, \`loadProfileContent()\` |
| | PATCH | \`/users/me\` | \`editProfile()\` |
| | GET | \`/users/me/contacts\` | \`loadMe()\` |
| **Friends** | GET | \`/users/me/friends\` | \`loadFriendCount()\`, \`renderFriendsAsync()\` |
| | GET | \`/users/:handle/friends\` | \`loadProfileContent()\` |
| | GET | \`/users/:handle/mutuals\` | \`loadProfileContent()\` |
| | POST | \`/friends/request/:id\` | \`sendFriendRequest()\` |
| **Discover** | GET | \`/discover/suggestions\` | \`loadDiscoverContent()\` |
| | GET | \`/discover/search\` | \`doDiscoverSearch()\` |
| **Export** | GET | \`/export/vcf\` | \`exportVcf()\` |
| | GET | \`/export/csv\` | \`exportCsv()\` |
| **Settings** | PATCH | \`/settings\` | \`togglePrivacy()\` |
| **Notifications** | GET | \`/users/me/notifications\` | \`loadMe()\`, \`loadNotificationsView()\` |
| | POST | \`/users/me/notifications/:id/read\` | \`markNotifRead()\` |
| | POST | \`/users/me/notifications/read-all\` | \`markAllRead()\` |
| **QR** | GET | \`/qr/:handle/data-url\` | \`openQR()\` |

That's 20 distinct endpoint paths — hitting every backend route except \`GET /qr/:handle\` (the raw PNG endpoint) and the import endpoints (\`POST /import/vcf\` and \`POST /import/csv\`).

## 25. What's Different from the Alpha

The alpha prototype (\`rolodex-alpha.html\`) and the API-backed frontend (\`rolodex.html\`) look identical to the user. Under the hood, everything changed:

| Aspect | Alpha | API-backed |
|--------|-------|------------|
| Data source | Hardcoded \`USERS\` object | Live API calls |
| Auth | None (always logged in) | JWT with refresh |
| Friend requests | \`showToast('Request sent!')\` only | \`POST /friends/request/:id\` |
| QR codes | Placeholder checkerboard | Real QR from backend |
| Search | Client-side filter of mock data | API search + client-side friend filter |
| Discover | Static array | Friends-of-friends ranked by mutuals |
| Export | Not functional | Real vCard/CSV downloads |
| Privacy | Toggle with no effect | \`PATCH /settings\` persisted |
| Notifications | Always "2 unread" | Live count from backend |
| Profile editing | No-op | \`PATCH /users/me\` |
| Persistence | None (resets on reload) | localStorage tokens + SQLite |
