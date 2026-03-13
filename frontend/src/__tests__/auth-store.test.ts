import { describe, it, expect, beforeEach } from "vitest";
import { getTokens, saveTokens, clearTokens, isAuthenticated } from "../stores/auth";

describe("auth store", () => {
  beforeEach(() => {
    localStorage.clear();
    clearTokens();
  });

  it("returns null when no tokens stored", () => {
    expect(getTokens()).toBeNull();
  });

  it("stores and retrieves tokens", () => {
    saveTokens({ accessToken: "abc", refreshToken: "def" });
    const tokens = getTokens();
    expect(tokens).toEqual({ accessToken: "abc", refreshToken: "def" });
  });

  it("persists tokens to localStorage", () => {
    saveTokens({ accessToken: "abc", refreshToken: "def" });
    const stored = localStorage.getItem("rolodex_tokens");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({ accessToken: "abc", refreshToken: "def" });
  });

  it("clears tokens", () => {
    saveTokens({ accessToken: "abc", refreshToken: "def" });
    clearTokens();
    expect(getTokens()).toBeNull();
    expect(localStorage.getItem("rolodex_tokens")).toBeNull();
  });

  it("reports authentication state", () => {
    expect(isAuthenticated()).toBe(false);
    saveTokens({ accessToken: "abc", refreshToken: "def" });
    expect(isAuthenticated()).toBe(true);
    clearTokens();
    expect(isAuthenticated()).toBe(false);
  });

  it("restores tokens from localStorage on access", () => {
    localStorage.setItem("rolodex_tokens", JSON.stringify({ accessToken: "x", refreshToken: "y" }));
    // Need to call getTokens to pick up from storage
    const tokens = getTokens();
    expect(tokens).toEqual({ accessToken: "x", refreshToken: "y" });
  });
});
