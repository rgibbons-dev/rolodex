import { describe, it, expect } from "vitest";
import { generateProfileQR, generateProfileQRDataURL } from "../../src/lib/qr.js";

describe("QR code generation", () => {
  it("generates a PNG buffer", async () => {
    const buffer = await generateProfileQR("testuser");
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4e); // N
    expect(buffer[3]).toBe(0x47); // G
  });

  it("generates a data URL string", async () => {
    const dataUrl = await generateProfileQRDataURL("testuser");
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("generates different QR codes for different handles", async () => {
    const qr1 = await generateProfileQR("alice");
    const qr2 = await generateProfileQR("bob");
    expect(qr1.equals(qr2)).toBe(false);
  });
});
