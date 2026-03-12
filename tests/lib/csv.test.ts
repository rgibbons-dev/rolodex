import { describe, it, expect } from "vitest";
import { generateCsv, parseCsv } from "../../src/lib/csv.js";

describe("CSV generation", () => {
  it("generates header row", () => {
    const csv = generateCsv([]);
    expect(csv).toBe("Display Name,Handle,Type,Label,Value");
  });

  it("generates rows from contacts", () => {
    const csv = generateCsv([
      { displayName: "Alice", handle: "alice", type: "phone", label: "Mobile", value: "1234567890" },
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Alice,alice,phone,Mobile,1234567890");
  });

  it("prefixes phone numbers starting with + (injection prevention)", () => {
    const csv = generateCsv([
      { displayName: "Alice", handle: "alice", type: "phone", label: "Mobile", value: "+1234567890" },
    ]);
    expect(csv).toContain("'+1234567890");
  });

  it("escapes commas in values", () => {
    const csv = generateCsv([
      { displayName: "Bob, Jr.", handle: "bob", type: "email", label: "Work", value: "bob@test.com" },
    ]);
    expect(csv).toContain('"Bob, Jr."');
  });

  it("escapes double quotes", () => {
    const csv = generateCsv([
      { displayName: 'Say "hi"', handle: "say", type: "email", label: "Work", value: "a@b.com" },
    ]);
    expect(csv).toContain('"Say ""hi"""');
  });

  it("prefixes formula injection characters with single quote", () => {
    const csv = generateCsv([
      { displayName: "=CALC()", handle: "calc", type: "custom", label: "Hack", value: "+cmd" },
    ]);
    // The display name starts with = so should be prefixed
    expect(csv).toContain("'=CALC()");
    // The value starts with + so should be prefixed
    expect(csv).toContain("'+cmd");
  });

  it("prefixes - and @ injection characters", () => {
    const csv = generateCsv([
      { displayName: "-dangerous", handle: "x", type: "custom", label: "@label", value: "safe" },
    ]);
    expect(csv).toContain("'-dangerous");
    expect(csv).toContain("'@label");
  });
});

describe("CSV parsing", () => {
  it("returns empty for no data rows", () => {
    const result = parseCsv("Display Name,Handle,Type,Label,Value");
    expect(result).toEqual([]);
  });

  it("parses simple rows", () => {
    const csv = "Display Name,Handle,Type,Label,Value\r\nAlice,alice,phone,Mobile,+1234567890";
    const result = parseCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      displayName: "Alice",
      handle: "alice",
      type: "phone",
      label: "Mobile",
      value: "+1234567890",
    });
  });

  it("handles quoted fields with commas", () => {
    const csv = 'Display Name,Handle,Type,Label,Value\r\n"Bob, Jr.",bob,email,Work,bob@test.com';
    const result = parseCsv(csv);
    expect(result[0].displayName).toBe("Bob, Jr.");
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const csv = 'Display Name,Handle,Type,Label,Value\r\n"Say ""hi""",say,email,Work,a@b.com';
    const result = parseCsv(csv);
    expect(result[0].displayName).toBe('Say "hi"');
  });

  it("skips rows with fewer than 5 fields", () => {
    const csv = "Display Name,Handle,Type,Label,Value\r\nAlice,alice";
    const result = parseCsv(csv);
    expect(result).toHaveLength(0);
  });

  it("roundtrips generate → parse for safe values", () => {
    const contacts = [
      { displayName: "Alice Smith", handle: "alice", type: "phone", label: "Mobile", value: "+1234567890" },
      { displayName: "Bob Jones", handle: "bob", type: "email", label: "Work", value: "bob@work.com" },
    ];
    const csv = generateCsv(contacts);
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].displayName).toBe("Alice Smith");
    expect(parsed[1].handle).toBe("bob");
  });
});
