/**
 * vCard 3.0 generation and parsing.
 */

export interface VCardContact {
  displayName: string;
  handle?: string;
  contacts: Array<{
    type: string;
    label: string;
    value: string;
  }>;
}

/**
 * Generate a single vCard 3.0 string from a contact.
 */
function contactToVCard(contact: VCardContact): string {
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(contact.displayName)}`,
  ];

  if (contact.handle) {
    lines.push(`NOTE:Rolodex @${contact.handle}`);
  }

  for (const c of contact.contacts) {
    switch (c.type) {
      case "phone":
        lines.push(`TEL;TYPE=CELL:${c.value}`);
        break;
      case "email":
        lines.push(`EMAIL;TYPE=INTERNET:${c.value}`);
        break;
      case "whatsapp":
        lines.push(`X-WHATSAPP:${c.value}`);
        break;
      case "telegram":
        lines.push(`X-TELEGRAM:${c.value}`);
        break;
      case "signal":
        lines.push(`X-SIGNAL:${c.value}`);
        break;
      case "snapchat":
        lines.push(`X-SNAPCHAT:${c.value}`);
        break;
      case "instagram":
        lines.push(`X-INSTAGRAM:${c.value}`);
        break;
      default:
        lines.push(`X-${c.type.toUpperCase()}:${c.value}`);
        break;
    }
  }

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/**
 * Generate a vCard file string for multiple contacts.
 */
export function generateVCards(contacts: VCardContact[]): string {
  return contacts.map(contactToVCard).join("\r\n");
}

/**
 * Parse a vCard file string into contacts.
 * Handles basic vCard 3.0 format.
 */
export function parseVCards(vcfContent: string): VCardContact[] {
  const cards: VCardContact[] = [];
  const blocks = vcfContent.split("BEGIN:VCARD");

  for (const block of blocks) {
    if (!block.includes("END:VCARD")) continue;

    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let displayName = "";
    const contacts: VCardContact["contacts"] = [];

    for (const line of lines) {
      if (line.startsWith("FN:")) {
        displayName = unescapeVCard(line.slice(3));
      } else if (line.startsWith("TEL")) {
        const value = line.split(":").slice(1).join(":");
        contacts.push({ type: "phone", label: "Phone", value });
      } else if (line.startsWith("EMAIL")) {
        const value = line.split(":").slice(1).join(":");
        contacts.push({ type: "email", label: "Email", value });
      } else if (line.startsWith("X-WHATSAPP:")) {
        contacts.push({ type: "whatsapp", label: "WhatsApp", value: line.slice(11) });
      } else if (line.startsWith("X-TELEGRAM:")) {
        contacts.push({ type: "telegram", label: "Telegram", value: line.slice(11) });
      } else if (line.startsWith("X-SIGNAL:")) {
        contacts.push({ type: "signal", label: "Signal", value: line.slice(9) });
      } else if (line.startsWith("X-SNAPCHAT:")) {
        contacts.push({ type: "snapchat", label: "Snapchat", value: line.slice(11) });
      } else if (line.startsWith("X-INSTAGRAM:")) {
        contacts.push({ type: "instagram", label: "Instagram", value: line.slice(12) });
      }
    }

    if (displayName) {
      cards.push({ displayName, contacts });
    }
  }

  return cards;
}

function escapeVCard(value: string): string {
  return value.replace(/[,;\\]/g, (m) => `\\${m}`);
}

function unescapeVCard(value: string): string {
  return value.replace(/\\([,;\\])/g, "$1");
}
