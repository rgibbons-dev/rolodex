import { Component, createResource, For, Show, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import type { Circle } from "../types";
import { Modal } from "../components/Modal";
import { showToast } from "../components/Toast";

async function loadCircles(): Promise<Circle[]> {
  const res = await api("/users/me/circles");
  if (!res.ok) return [];
  const data = await res.json();
  return data.circles || [];
}

export const CirclesPage: Component = () => {
  const navigate = useNavigate();
  const [circles, { refetch }] = createResource(loadCircles);
  const [showCreate, setShowCreate] = createSignal(false);
  const [name, setName] = createSignal("");
  const [desc, setDesc] = createSignal("");
  const [error, setError] = createSignal("");

  async function submitCreate() {
    if (!name().trim()) { setError("Name is required"); return; }
    setError("");
    const res = await api("/users/me/circles", {
      method: "POST",
      body: { name: name(), description: desc() },
    });
    if (res.ok) {
      setShowCreate(false);
      setName(""); setDesc("");
      refetch();
      showToast("Circle created!");
    } else {
      const d = await res.json();
      setError(d.error || "Failed");
    }
  }

  return (
    <div class="view">
      <div class="top-bar">
        <div class="top-bar-row">
          <button class="back-btn" onClick={() => navigate("/settings")}>
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4L5 9l6 5" /></svg>
            Back
          </button>
          <button class="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>+ New Circle</button>
        </div>
        <h1 style={{ "margin-top": "8px" }}>Circles</h1>
        <div class="subtitle">Group friends to control contact sharing</div>
      </div>

      <Show when={!circles.loading} fallback={<div class="loading-center"><div class="spinner" /></div>}>
        <Show when={(circles() || []).length > 0} fallback={
          <div class="empty-state">
            <p>No circles yet</p>
            <p style={{ "margin-top": "8px", "font-size": "0.78rem" }}>
              Create a circle to control which contact methods specific friends can see
            </p>
          </div>
        }>
          <For each={circles()}>
            {(circle) => (
              <div class="settings-row" onClick={() => navigate(`/circles/${circle.id}`)}>
                <div>
                  <div style={{ "font-weight": "600" }}>{circle.name}</div>
                  <Show when={circle.description}>
                    <div style={{ "font-size": "0.78rem", color: "var(--stone-400)" }}>{circle.description}</div>
                  </Show>
                  <div style={{ "font-size": "0.72rem", color: "var(--stone-400)", "margin-top": "2px" }}>
                    {circle.memberCount ?? 0} members {"\u00B7"} {circle.contactCount ?? 0} contacts shared
                  </div>
                </div>
                <svg class="chevron" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M6 3l5 5-5 5" />
                </svg>
              </div>
            )}
          </For>
        </Show>
      </Show>

      <Modal open={showCreate()} onClose={() => setShowCreate(false)}>
        <h3>New Circle</h3>
        <div class="form-field">
          <label>Name</label>
          <input type="text" placeholder="e.g. Close Friends" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <div class="form-field">
          <label>Description (optional)</label>
          <input type="text" placeholder="What's this circle for?" value={desc()} onInput={(e) => setDesc(e.currentTarget.value)} />
        </div>
        <Show when={error()}><p class="form-error">{error()}</p></Show>
        <div class="form-actions">
          <button class="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          <button class="btn btn-primary" onClick={submitCreate}>Create</button>
        </div>
      </Modal>
    </div>
  );
};
