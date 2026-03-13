import { Component, createSignal, createResource, For, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import { getHandle, me, setMe } from "../stores/auth";
import type { ContactLink, Profile, MeData } from "../types";
import { Avatar } from "../components/Avatar";
import { ContactLinkRow } from "../components/ContactLinkRow";
import { Modal } from "../components/Modal";
import { showToast } from "../components/Toast";

const CONTACT_TYPES = [
  { value: "phone", label: "Phone" }, { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" }, { value: "telegram", label: "Telegram" },
  { value: "signal", label: "Signal" }, { value: "snapchat", label: "Snapchat" },
  { value: "instagram", label: "Instagram" }, { value: "custom", label: "Custom" },
];

async function loadProfile(): Promise<MeData | null> {
  const handle = getHandle();
  if (!handle) return null;

  const [contactsRes, profileRes] = await Promise.all([
    api("/users/me/contacts"),
    api(`/users/${handle}`),
  ]);

  if (!contactsRes.ok || !profileRes.ok) return null;

  const [contactData, profile] = await Promise.all([contactsRes.json(), profileRes.json()]);

  const meData: MeData = {
    ...profile,
    myContacts: contactData.contacts || [],
  };
  setMe(meData);
  return meData;
}

export const MyProfilePage: Component = () => {
  const navigate = useNavigate();
  const [data, { refetch }] = createResource(loadProfile);
  const [friendCount, setFriendCount] = createSignal<number | null>(null);
  const [showAddModal, setShowAddModal] = createSignal(false);
  const [editContact, setEditContact] = createSignal<ContactLink | null>(null);
  const [showQrModal, setShowQrModal] = createSignal(false);
  const [qrDataUrl, setQrDataUrl] = createSignal("");

  // Form state
  const [cfType, setCfType] = createSignal("phone");
  const [cfLabel, setCfLabel] = createSignal("");
  const [cfValue, setCfValue] = createSignal("");
  const [cfVisibility, setCfVisibility] = createSignal("friends_only");
  const [cfShared, setCfShared] = createSignal(true);
  const [cfError, setCfError] = createSignal("");

  async function openQr() {
    const h = getHandle();
    if (!h) return;
    try {
      const res = await api(`/qr/${h}/data-url`);
      if (res.ok) {
        const d = await res.json();
        setQrDataUrl(d.dataUrl);
        setShowQrModal(true);
      } else {
        showToast("Failed to load QR code");
      }
    } catch { showToast("Network error"); }
  }

  onMount(async () => {
    try {
      const res = await api("/users/me/friends?limit=1");
      if (res.ok) {
        const d = await res.json();
        setFriendCount(d.total ?? d.friends?.length ?? 0);
      }
    } catch {}
  });

  function openAdd() {
    setCfType("phone"); setCfLabel(""); setCfValue("");
    setCfVisibility("friends_only"); setCfShared(true); setCfError("");
    setShowAddModal(true);
  }

  function openEdit(c: ContactLink) {
    setCfLabel(c.label); setCfValue(c.value);
    setCfVisibility(c.visibility || "friends_only");
    setCfShared(c.sharedByDefault !== false);
    setCfError("");
    setEditContact(c);
  }

  async function submitAdd() {
    if (!cfLabel() || !cfValue()) { setCfError("Label and value are required"); return; }
    setCfError("");
    try {
      const res = await api("/users/me/contacts", {
        method: "POST",
        body: { type: cfType(), label: cfLabel(), value: cfValue(), visibility: cfVisibility(), sharedByDefault: cfShared() },
      });
      if (res.ok) {
        setShowAddModal(false);
        refetch();
        showToast("Contact added!");
      } else {
        const d = await res.json();
        setCfError(d.error || "Failed to add");
      }
    } catch { setCfError("Network error"); }
  }

  async function submitEdit() {
    const c = editContact();
    if (!c) return;
    if (!cfLabel() || !cfValue()) { setCfError("Label and value are required"); return; }
    setCfError("");
    try {
      const res = await api(`/users/me/contacts/${c.id}`, {
        method: "PATCH",
        body: { label: cfLabel(), value: cfValue(), visibility: cfVisibility(), sharedByDefault: cfShared() },
      });
      if (res.ok) {
        setEditContact(null);
        refetch();
        showToast("Contact updated!");
      } else {
        const d = await res.json();
        setCfError(d.error || "Failed to update");
      }
    } catch { setCfError("Network error"); }
  }

  async function doDelete(c: ContactLink) {
    if (!confirm(`Remove "${c.label}"?`)) return;
    try {
      const res = await api(`/users/me/contacts/${c.id}`, { method: "DELETE" });
      if (res.ok) {
        refetch();
        showToast("Contact removed");
      }
    } catch { showToast("Network error"); }
  }

  return (
    <div class="view" id="view-my-profile">
      <div class="top-bar">
        <div class="top-bar-row">
          <div>
            <h1>Rolodex</h1>
            <div class="subtitle">Your connection card</div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button class="icon-btn" onClick={openQr} title="Share QR Code">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <rect x="2" y="2" width="5" height="5" rx="1" /><rect x="11" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="11" width="5" height="5" rx="1" /><rect x="12" y="12" width="1.5" height="1.5" />
                <path d="M16 11h-2v3h3v-1.5M11 16h2" />
              </svg>
            </button>
            <button class="icon-btn" onClick={() => navigate("/settings")} title="Settings">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <circle cx="9" cy="9" r="2.5" /><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <Show when={!data.loading && data()} fallback={<div class="loading-center"><div class="spinner" /></div>}>
        {(d) => (
          <>
            <div class="profile-header fade-in-up">
              <Avatar displayName={d().displayName} id={d().id} avatarUrl={d().avatarUrl} size="xl" />
              <div class="profile-name">{d().displayName}</div>
              <div class="profile-handle">@{d().handle}</div>
              <div class="profile-bio">{d().bio}</div>
              <div class="profile-stats">
                <div class="stat">
                  <div class="stat-num">{friendCount() ?? "..."}</div>
                  <div class="stat-label">Friends</div>
                </div>
                <div class="stat">
                  <div class="stat-num">{d().myContacts.length}</div>
                  <div class="stat-label">Links</div>
                </div>
              </div>
            </div>

            <div class="section-label">How to reach me</div>
            <div class="contact-grid">
              <For each={d().myContacts}>
                {(c) => (
                  <ContactLinkRow
                    contact={c}
                    editable
                    onEdit={() => openEdit(c)}
                    onDelete={() => doDelete(c)}
                  />
                )}
              </For>
            </div>
            <button class="add-btn" onClick={openAdd}>+ Add a way to reach you</button>
          </>
        )}
      </Show>

      {/* Add Contact Modal */}
      <Modal open={showAddModal()} onClose={() => setShowAddModal(false)}>
        <h3>Add Contact Method</h3>
        <div class="form-row">
          <div class="form-field">
            <label>Type</label>
            <select value={cfType()} onChange={(e) => {
              setCfType(e.currentTarget.value);
              if (!cfLabel()) setCfLabel(CONTACT_TYPES.find(t => t.value === e.currentTarget.value)?.label || "");
            }}>
              <For each={CONTACT_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
            </select>
          </div>
          <div class="form-field">
            <label>Label</label>
            <input type="text" placeholder="e.g. Personal" value={cfLabel()} onInput={(e) => setCfLabel(e.currentTarget.value)} />
          </div>
        </div>
        <div class="form-field">
          <label>Value</label>
          <input type="text" placeholder="e.g. +1 (555) 123-4567" value={cfValue()} onInput={(e) => setCfValue(e.currentTarget.value)} />
        </div>
        <div class="form-field">
          <label>Visibility</label>
          <select value={cfVisibility()} onChange={(e) => setCfVisibility(e.currentTarget.value)}>
            <option value="friends_only">Friends only</option>
            <option value="everyone">Everyone</option>
            <option value="friends_of_friends">Friends of friends</option>
          </select>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <div class="toggle-label-main">Share with new connections</div>
            <div class="toggle-label-desc">If off, only shared via Circles</div>
          </div>
          <label class="toggle">
            <input type="checkbox" checked={cfShared()} onChange={(e) => setCfShared(e.currentTarget.checked)} />
            <span class="toggle-slider" />
          </label>
        </div>
        <Show when={cfError()}><p class="form-error">{cfError()}</p></Show>
        <div class="form-actions">
          <button class="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
          <button class="btn btn-primary" onClick={submitAdd}>Add</button>
        </div>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal open={!!editContact()} onClose={() => setEditContact(null)}>
        <h3>Edit Contact</h3>
        <div class="form-field">
          <label>Label</label>
          <input type="text" value={cfLabel()} onInput={(e) => setCfLabel(e.currentTarget.value)} />
        </div>
        <div class="form-field">
          <label>Value</label>
          <input type="text" value={cfValue()} onInput={(e) => setCfValue(e.currentTarget.value)} />
        </div>
        <div class="form-field">
          <label>Visibility</label>
          <select value={cfVisibility()} onChange={(e) => setCfVisibility(e.currentTarget.value)}>
            <option value="friends_only">Friends only</option>
            <option value="everyone">Everyone</option>
            <option value="friends_of_friends">Friends of friends</option>
          </select>
        </div>
        <div class="toggle-row">
          <div class="toggle-label">
            <div class="toggle-label-main">Share with new connections</div>
            <div class="toggle-label-desc">If off, only shared via Circles</div>
          </div>
          <label class="toggle">
            <input type="checkbox" checked={cfShared()} onChange={(e) => setCfShared(e.currentTarget.checked)} />
            <span class="toggle-slider" />
          </label>
        </div>
        <Show when={cfError()}><p class="form-error">{cfError()}</p></Show>
        <div class="form-actions">
          <button class="btn btn-secondary" onClick={() => setEditContact(null)}>Cancel</button>
          <button class="btn btn-primary" onClick={submitEdit}>Save</button>
        </div>
      </Modal>

      {/* QR Code Modal */}
      <Modal open={showQrModal()} onClose={() => setShowQrModal(false)}>
        <h3 style={{ "text-align": "center" }}>Your QR Code</h3>
        <p style={{ "text-align": "center", "font-size": "0.85rem", color: "var(--stone-400)" }}>
          Share this to let people find your profile
        </p>
        <Show when={qrDataUrl()}>
          <div style={{ display: "flex", "justify-content": "center", padding: "16px 0" }}>
            <img src={qrDataUrl()} alt="Profile QR Code" style={{ width: "200px", height: "200px" }} />
          </div>
        </Show>
        <div class="form-actions">
          <button class="btn btn-secondary" onClick={() => setShowQrModal(false)}>Close</button>
        </div>
      </Modal>
    </div>
  );
};
