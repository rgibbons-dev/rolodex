import { Hono } from "hono";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateProfileQR, generateProfileQRDataURL } from "../lib/qr.js";

const qr = new Hono();

/**
 * GET /qr/:handle — Download QR code as PNG for a user's profile.
 */
qr.get("/qr/:handle", async (c) => {
  const handle = c.req.param("handle");

  // Verify user exists
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const png = await generateProfileQR(handle);

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${handle}-qr.png"`,
    },
  });
});

/**
 * GET /qr/:handle/data-url — Get QR code as a base64 data URL (for embedding).
 */
qr.get("/qr/:handle/data-url", async (c) => {
  const handle = c.req.param("handle");

  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  if (user.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const dataUrl = await generateProfileQRDataURL(handle);
  return c.json({ dataUrl, handle });
});

export default qr;
