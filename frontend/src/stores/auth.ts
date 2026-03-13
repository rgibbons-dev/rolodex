import { createSignal } from "solid-js";
import type { AuthTokens, User, ContactLink } from "../types";

const STORAGE_KEY = "rolodex_tokens";
const ME_KEY = "rolodex_me";

// Initialize from localStorage
function loadFromStorage(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

const [tokens, setTokens] = createSignal<AuthTokens | null>(loadFromStorage());

export interface MeData extends User {
  myContacts: ContactLink[];
}

const [me, setMe] = createSignal<MeData | null>(() => {
  try {
    const raw = localStorage.getItem(ME_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

export function getTokens(): AuthTokens | null {
  // Also check localStorage in case another tab updated it
  const current = tokens();
  if (current) return current;
  const fromStorage = loadFromStorage();
  if (fromStorage) {
    setTokens(fromStorage);
  }
  return fromStorage;
}

export function saveTokens(t: AuthTokens): void {
  setTokens(t);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

export function clearTokens(): void {
  setTokens(null);
  setMe(null);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ME_KEY);
}

export function isAuthenticated(): boolean {
  return getTokens() !== null;
}

export function getHandle(): string | null {
  const t = getTokens();
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.accessToken.split(".")[1]));
    return payload.handle || null;
  } catch {
    return null;
  }
}

export { me, setMe };
