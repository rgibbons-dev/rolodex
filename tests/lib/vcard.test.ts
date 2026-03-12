import { describe, it, expect } from "vitest";
import { generateVCards, parseVCards } from "../../src/lib/vcard.js";

describe("vCard generation", () => {
  it("generates a valid vCard 3.0 with display name", () => {
    const vcf = generateVCards([
      { displayName: "Alice", contacts: [] },
    ]);
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("VERSION:3.0");
    expect(vcf).toContain("FN:Alice");
    expect(vcf).toContain("END:VCARD");
  });

  it("includes NOTE with handle when provided", () => {
    const vcf = generateVCards([
      { displayName: "Alice", handle: "alice", contacts: [] },
    ]);
    expect(vcf).toContain("NOTE:Rolodex @alice");
  });

  it("generates phone as TEL;TYPE=CELL", () => {
    const vcf = generateVCards([
      { displayName: "Bob", contacts: [{ type: "phone", label: "Mobile", value: "+1234567890" }] },
    ]);
    expect(vcf).toContain("TEL;TYPE=CELL:+1234567890");
  });

  it("generates email as EMAIL;TYPE=INTERNET", () => {
    const vcf = generateVCards([
      { displayName: "Bob", contacts: [{ type: "email", label: "Work", value: "bob@test.com" }] },
    ]);
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:bob@test.com");
  });

  it("generates social media as X- properties", () => {
    const vcf = generateVCards([{
      displayName: "Carol",
      contacts: [
        { type: "whatsapp", label: "WA", value: "+1111" },
        { type: "telegram", label: "TG", value: "@carol" },
        { type: "signal", label: "Sig", value: "+2222" },
        { type: "snapchat", label: "SC", value: "carol_snap" },
        { type: "instagram", label: "IG", value: "@carol_ig" },
      ],
    }]);
    expect(vcf).toContain("X-WHATSAPP:+1111");
    expect(vcf).toContain("X-TELEGRAM:@carol");
    expect(vcf).toContain("X-SIGNAL:+2222");
    expect(vcf).toContain("X-SNAPCHAT:carol_snap");
    expect(vcf).toContain("X-INSTAGRAM:@carol_ig");
  });

  it("generates custom types as X-TYPE", () => {
    const vcf = generateVCards([
      { displayName: "Dave", contacts: [{ type: "custom", label: "Custom", value: "dave123" }] },
    ]);
    expect(vcf).toContain("X-CUSTOM:dave123");
  });

  it("escapes special vCard characters in display name", () => {
    const vcf = generateVCards([
      { displayName: "O'Brien, Jr.", contacts: [] },
    ]);
    expect(vcf).toContain("FN:O'Brien\\, Jr.");
  });

  it("generates multiple vCards separated correctly", () => {
    const vcf = generateVCards([
      { displayName: "Alice", contacts: [] },
      { displayName: "Bob", contacts: [] },
    ]);
    const cards = vcf.split("BEGIN:VCARD").filter(Boolean);
    expect(cards).toHaveLength(2);
  });
});

describe("vCard parsing", () => {
  it("parses a simple vCard", () => {
    const vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nEND:VCARD";
    const result = parseVCards(vcf);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("Alice");
  });

  it("parses phone numbers", () => {
    const vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bob\r\nTEL;TYPE=CELL:+1234567890\r\nEND:VCARD";
    const result = parseVCards(vcf);
    expect(result[0].contacts).toHaveLength(1);
    expect(result[0].contacts[0]).toEqual({ type: "phone", label: "Phone", value: "+1234567890" });
  });

  it("parses emails", () => {
    const vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bob\r\nEMAIL;TYPE=INTERNET:bob@test.com\r\nEND:VCARD";
    const result = parseVCards(vcf);
    expect(result[0].contacts[0]).toEqual({ type: "email", label: "Email", value: "bob@test.com" });
  });

  it("parses social media X- properties", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Carol",
      "X-WHATSAPP:+1111",
      "X-TELEGRAM:@carol",
      "X-SIGNAL:+2222",
      "X-SNAPCHAT:carol_snap",
      "X-INSTAGRAM:@carol_ig",
      "END:VCARD",
    ].join("\r\n");
    const result = parseVCards(vcf);
    expect(result[0].contacts).toHaveLength(5);
    expect(result[0].contacts[0]).toEqual({ type: "whatsapp", label: "WhatsApp", value: "+1111" });
    expect(result[0].contacts[4]).toEqual({ type: "instagram", label: "Instagram", value: "@carol_ig" });
  });

  it("skips blocks without FN", () => {
    const vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD";
    const result = parseVCards(vcf);
    expect(result).toHaveLength(0);
  });

  it("handles multiple vCards", () => {
    const vcf = [
      "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Alice\r\nEND:VCARD",
      "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bob\r\nEND:VCARD",
    ].join("\r\n");
    const result = parseVCards(vcf);
    expect(result).toHaveLength(2);
  });

  it("unescapes vCard special characters", () => {
    const vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:O'Brien\\, Jr.\r\nEND:VCARD";
    const result = parseVCards(vcf);
    expect(result[0].displayName).toBe("O'Brien, Jr.");
  });

  it("roundtrips generate → parse", () => {
    const contacts = [{
      displayName: "Alice",
      handle: "alice",
      contacts: [
        { type: "phone", label: "Mobile", value: "+1234567890" },
        { type: "email", label: "Work", value: "alice@test.com" },
      ],
    }];
    const vcf = generateVCards(contacts);
    const parsed = parseVCards(vcf);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].displayName).toBe("Alice");
    expect(parsed[0].contacts).toHaveLength(2);
    expect(parsed[0].contacts[0].value).toBe("+1234567890");
  });
});
