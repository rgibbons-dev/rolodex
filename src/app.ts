import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";

import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import friendRoutes from "./routes/friends.js";
import discoveryRoutes from "./routes/discovery.js";
import exportRoutes from "./routes/export.js";
import settingsRoutes from "./routes/settings.js";
import qrRoutes from "./routes/qr.js";
import seedRoutes from "./routes/seed.js";
import circlesRoutes from "./routes/circles.js";

import { rateLimit } from "./lib/rate-limit.js";

import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// --- Global middleware ---
app.use("*", logger());
app.use("*", cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
}));

// --- Rate limiting on sensitive endpoints ---
app.use("/discover/search", rateLimit({ prefix: "search", max: 30, windowSeconds: 60 }));
app.use("/friends/request/*", rateLimit({ prefix: "friend_req", max: 20, windowSeconds: 60 }));
app.use("/auth/*", rateLimit({ prefix: "auth", max: 10, windowSeconds: 60 }));
app.use("/seed", rateLimit({ prefix: "seed", max: 5, windowSeconds: 60 }));
app.use("/export/*", rateLimit({ prefix: "export", max: 20, windowSeconds: 60 }));
app.use("/qr/*", rateLimit({ prefix: "qr", max: 30, windowSeconds: 60 }));
app.use("/users/me", rateLimit({ prefix: "profile_update", max: 20, windowSeconds: 60 }));
app.use("/settings/account", rateLimit({ prefix: "account_delete", max: 5, windowSeconds: 60 }));

// --- Serve uploaded files (avatar stubs) ---
app.use("/uploads/*", serveStatic({ root: "./" }));

// --- Routes ---
app.route("/auth", authRoutes);
app.route("/", profileRoutes);
app.route("/", friendRoutes);
app.route("/", discoveryRoutes);
app.route("/", exportRoutes);
app.route("/", settingsRoutes);
app.route("/", qrRoutes);
app.route("/", seedRoutes);
app.route("/", circlesRoutes);

// --- Serve frontend ---
app.use("/rolodex.html", serveStatic({ path: "./rolodex.html" }));
app.use("/rolodex-alpha.html", serveStatic({ path: "./rolodex-alpha.html" }));

// --- Health check ---
app.get("/health", (c) => c.json({ status: "ok" }));

// --- 404 fallback ---
app.notFound((c) => c.json({ error: "Not found" }, 404));

// --- Error handler ---
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
