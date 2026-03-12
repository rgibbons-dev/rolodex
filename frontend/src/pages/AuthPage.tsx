import { Component, createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import { saveTokens } from "../stores/auth";

export const AuthPage: Component = () => {
  const navigate = useNavigate();
  const [mode, setMode] = createSignal<"login" | "register">("login");
  const [email, setEmail] = createSignal("");
  const [handle, setHandle] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [error, setError] = createSignal("");
  const [info, setInfo] = createSignal("");
  const [showTokenInput, setShowTokenInput] = createSignal(false);
  const [magicToken, setMagicToken] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  async function doLogin() {
    setError("");
    setInfo("");
    if (!email()) { setError("Email is required"); return; }
    setLoading(true);
    try {
      const res = await api("/auth/login", { method: "POST", body: { email: email() } });
      if (res.ok) {
        setInfo("Magic link sent! Check your email (or enter token below).");
        setShowTokenInput(true);
      } else {
        const data = await res.json();
        setError(data.error || "Login failed");
      }
    } catch { setError("Network error"); }
    setLoading(false);
  }

  async function doRegister() {
    setError("");
    if (!handle() || !displayName() || !email()) { setError("All fields required"); return; }
    setLoading(true);
    try {
      const res = await api("/auth/register", {
        method: "POST",
        body: { handle: handle(), displayName: displayName(), email: email() },
      });
      const data = await res.json();
      if (res.ok) {
        saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        navigate("/", { replace: true });
      } else {
        setError(data.error || "Registration failed");
      }
    } catch { setError("Network error"); }
    setLoading(false);
  }

  async function verifyToken() {
    setError("");
    if (!magicToken()) return;
    setLoading(true);
    try {
      const res = await api(`/auth/magic-link/verify?token=${encodeURIComponent(magicToken())}`);
      const data = await res.json();
      if (res.ok) {
        saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        navigate("/", { replace: true });
      } else {
        setError(data.error || "Invalid token");
      }
    } catch { setError("Network error"); }
    setLoading(false);
  }

  return (
    <div class="auth-screen">
      <div class="auth-card">
        <h1>Welcome to Rolodex</h1>
        <p class="subtitle">Your modern address book</p>

        <Show when={mode() === "login"}>
          <div class="form-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
          </div>
          <Show when={!showTokenInput()}>
            <button class="btn btn-primary" onClick={doLogin} disabled={loading()}>
              {loading() ? "Sending..." : "Send Magic Link"}
            </button>
          </Show>
          <Show when={showTokenInput()}>
            <div class="form-field">
              <label>Magic Link Token</label>
              <input
                type="text"
                placeholder="Paste token from email"
                value={magicToken()}
                onInput={(e) => setMagicToken(e.currentTarget.value)}
              />
            </div>
            <button class="btn btn-primary" onClick={verifyToken} disabled={loading()}>
              Verify
            </button>
          </Show>
          <Show when={info()}><p class="form-info">{info()}</p></Show>
          <p class="auth-switch">
            Don't have an account? <a onClick={() => { setMode("register"); setError(""); }}>Create account</a>
          </p>
        </Show>

        <Show when={mode() === "register"}>
          <div class="form-field">
            <label>Handle</label>
            <input
              type="text"
              placeholder="yourhandle"
              value={handle()}
              onInput={(e) => setHandle(e.currentTarget.value)}
            />
          </div>
          <div class="form-field">
            <label>Display Name</label>
            <input
              type="text"
              placeholder="Your Name"
              value={displayName()}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
            />
          </div>
          <div class="form-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="email@example.com"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
          </div>
          <button class="btn btn-primary" onClick={doRegister} disabled={loading()}>
            {loading() ? "Creating..." : "Create Account"}
          </button>
          <p class="auth-switch">
            Already have an account? <a onClick={() => { setMode("login"); setError(""); }}>Sign in</a>
          </p>
        </Show>

        <Show when={error()}><p class="form-error">{error()}</p></Show>
      </div>
    </div>
  );
};
