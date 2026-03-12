import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { MemoryRouter, Route } from "@solidjs/router";
import { AuthPage } from "../pages/AuthPage";
import { MyProfilePage } from "../pages/MyProfilePage";
import { FriendsPage } from "../pages/FriendsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { clearTokens, saveTokens } from "../stores/auth";
import { setBaseUrl } from "../api/client";

const mockFetch = vi.fn();

function renderPage(Comp: any, url = "/") {
  return render(() => (
    <MemoryRouter initialEntries={[url]}>
      <Route path="*" component={Comp} />
    </MemoryRouter>
  ));
}

describe("AuthPage", () => {
  beforeEach(() => {
    clearTokens();
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("renders login form by default", () => {
    renderPage(AuthPage, "/auth");
    expect(screen.getByText("Welcome to Rolodex")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("email@example.com")).toBeInTheDocument();
  });

  it("can switch to register mode", () => {
    renderPage(AuthPage, "/auth");
    fireEvent.click(screen.getByText("Create account"));
    expect(screen.getByPlaceholderText("yourhandle")).toBeInTheDocument();
  });

  it("shows demo login button", () => {
    renderPage(AuthPage, "/auth");
    expect(screen.getByText(/demo data/i)).toBeInTheDocument();
  });
});

describe("MyProfilePage", () => {
  beforeEach(() => {
    clearTokens();
    setBaseUrl("");
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("renders loading state initially", () => {
    saveTokens({ accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJoYW5kbGUiOiJ0ZXN0In0.abc", refreshToken: "r" });
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    renderPage(MyProfilePage, "/");
    expect(document.querySelector(".spinner") || document.querySelector(".loading-center")).toBeTruthy();
  });
});

describe("FriendsPage", () => {
  beforeEach(() => {
    clearTokens();
    setBaseUrl("");
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("renders search input", () => {
    saveTokens({ accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJoYW5kbGUiOiJ0ZXN0In0.abc", refreshToken: "r" });
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ friends: [], total: 0 }), { status: 200 }));
    renderPage(FriendsPage, "/friends");
    expect(screen.getByPlaceholderText(/search friends/i)).toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  beforeEach(() => {
    clearTokens();
    setBaseUrl("");
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it("renders settings sections", () => {
    saveTokens({ accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJoYW5kbGUiOiJ0ZXN0In0.abc", refreshToken: "r" });
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    renderPage(SettingsPage, "/settings");
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getAllByText("Circles").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });
});
