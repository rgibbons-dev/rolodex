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

import { rateLimit } from "./lib/rate-limit.js";

import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// --- Global middleware ---
app.use("*", logger());
app.use("*", cors());

// --- Rate limiting on sensitive endpoints ---
app.use("/discover/search", rateLimit({ prefix: "search", max: 30, windowSeconds: 60 }));
app.use("/friends/request/*", rateLimit({ prefix: "friend_req", max: 20, windowSeconds: 60 }));
app.use("/auth/*", rateLimit({ prefix: "auth", max: 10, windowSeconds: 60 }));

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
