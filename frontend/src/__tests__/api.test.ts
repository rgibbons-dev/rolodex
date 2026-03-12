import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, setBaseUrl } from "../api/client";
import { getTokens, saveTokens, clearTokens } from "../stores/auth";

describe("api client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearTokens();
    setBaseUrl("");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("makes GET requests", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await api("/health");
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("includes Authorization header when tokens exist", async () => {
    saveTokens({ accessToken: "test-token", refreshToken: "test-refresh" });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await api("/users/me/contacts");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers["Authorization"]).toBe("Bearer test-token");
  });

  it("sends JSON body for POST requests", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await api("/users/me/contacts", {
      method: "POST",
      body: { type: "phone", label: "Phone", value: "+1234" },
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(call[1].body)).toEqual({ type: "phone", label: "Phone", value: "+1234" });
  });

  it("attempts token refresh on 401 and retries", async () => {
    saveTokens({ accessToken: "expired", refreshToken: "valid-refresh" });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (url.includes("/auth/refresh")) {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: "new-token", refreshToken: "new-refresh" }), { status: 200 })
        );
      }
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response("{}", { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));
    });

    const res = await api("/users/me/contacts");
    expect(res.status).toBe(200);

    const tokens = getTokens();
    expect(tokens?.accessToken).toBe("new-token");
  });

  it("clears tokens when refresh fails", async () => {
    saveTokens({ accessToken: "expired", refreshToken: "also-expired" });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/refresh")) {
        return Promise.resolve(new Response("{}", { status: 401 }));
      }
      return Promise.resolve(new Response("{}", { status: 401 }));
    });

    const res = await api("/users/me/contacts");
    expect(res.status).toBe(401);
    expect(getTokens()).toBeNull();
  });
});
