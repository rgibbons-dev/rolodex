/**
 * CSV generation and parsing for contact export/import.
 */

export interface CsvContact {
  displayName: string;
  handle: string;
  type: string;
  label: string;
  value: string;
}

/**
 * Generate CSV content from contacts.
 */
export function generateCsv(contacts: CsvContact[]): string {
  const header = "Display Name,Handle,Type,Label,Value";
  const rows = contacts.map(
    (c) =>
      `${csvEscape(c.displayName)},${csvEscape(c.handle)},${csvEscape(c.type)},${csvEscape(c.label)},${csvEscape(c.value)}`
  );
  return [header, ...rows].join("\r\n");
}

/**
 * Parse CSV content into contacts.
 * Expects header row: Display Name, Handle, Type, Label, Value
 */
export function parseCsv(csvContent: string): CsvContact[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return []; // Need header + at least one data row

  // Skip header
  const dataLines = lines.slice(1);
  const contacts: CsvContact[] = [];

  for (const line of dataLines) {
    const fields = parseCsvLine(line);
    if (fields.length >= 5) {
      contacts.push({
        displayName: fields[0],
        handle: fields[1],
        type: fields[2],
        label: fields[3],
        value: fields[4],
      });
    }
  }

  return contacts;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Parse a single CSV line handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
