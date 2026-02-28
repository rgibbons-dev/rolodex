import { serve } from "@hono/node-server";
import app from "./app.js";

// Run migrations on startup
import "./db/migrate-runtime.js";

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`Rolodex API starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
