import { getTokens, saveTokens, clearTokens } from "../stores/auth";

let baseUrl = "";

export function setBaseUrl(url: string) {
  baseUrl = url;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
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

  // Auto-refresh on 401
  if (res.status === 401 && tokens?.refreshToken) {
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (refreshRes.ok) {
      const newTokens = await refreshRes.json();
      saveTokens(newTokens);
      // Retry with new token
      headers["Authorization"] = `Bearer ${newTokens.accessToken}`;
      res = await fetch(`${baseUrl}${path}`, { method, headers, body: init.body });
    } else {
      clearTokens();
    }
  }

  return res;
}
