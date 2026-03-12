import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB } from "./helpers.js";

describe("smoke", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  it("GET /health returns ok", async () => {
    const res = await request("GET", "/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /nonexistent returns 404", async () => {
    const res = await request("GET", "/nonexistent");
    expect(res.status).toBe(404);
  });
});
