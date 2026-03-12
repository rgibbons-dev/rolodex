import { describe, it, expect, beforeEach } from "vitest";
import { request, cleanDB } from "../helpers.js";

describe("seed route", () => {
  beforeEach(async () => {
    await cleanDB();
  });

  describe("POST /seed", () => {
    it("seeds demo data and returns tokens", async () => {
      const res = await request("POST", "/seed");
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(body.handle).toBe("jordanr");
    });

    it("returns already-seeded message on duplicate", async () => {
      await request("POST", "/seed");
      const res = await request("POST", "/seed");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain("Already seeded");
    });
  });
});
