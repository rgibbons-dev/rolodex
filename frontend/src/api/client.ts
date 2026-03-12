import { getTokens, saveTokens, clearTokens } from "../stores/auth";

let baseUrl = "";
let refreshPromise: Promise<boolean> | null = null;

export function setBaseUrl(url: string) {
  baseUrl = url;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function tryRefresh(staleRefreshToken: string): Promise<boolean> {
  try {
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: staleRefreshToken }),
    });

    if (refreshRes.ok) {
      const newTokens = await refreshRes.json();
      saveTokens(newTokens);
      return true;
    } else {
      // Only clear if tokens haven't changed (avoid wiping fresh tokens from seed/login)
      const current = getTokens();
      if (current?.refreshToken === staleRefreshToken) {
        clearTokens();
      }
      return false;
    }
  } catch {
    return false;
  } finally {
    refreshPromise = null;
  }
}

export async function api(path: string, opts: ApiOptions = {}): Promise<Response> {
  const { method = "GET", body, headers: extraHeaders = {} } = opts;

  const headers: Record<string, string> = { ...extraHeaders };
  const tokens = getTokens();
  if (tokens) {
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res = await fetch(`${baseUrl}${path}`, init);

  // Auto-refresh on 401 — deduplicate concurrent refreshes
  if (res.status === 401 && tokens?.refreshToken) {
    if (!refreshPromise) {
      refreshPromise = tryRefresh(tokens.refreshToken);
    }
    const refreshed = await refreshPromise;

    if (refreshed) {
      const newTokens = getTokens();
      if (newTokens) {
        headers["Authorization"] = `Bearer ${newTokens.accessToken}`;
        res = await fetch(`${baseUrl}${path}`, { method, headers, body: init.body });
      }
    }
  }

  return res;
}
