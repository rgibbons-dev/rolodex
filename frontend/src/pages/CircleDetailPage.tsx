import { Component, createResource, For, Show, createSignal } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import type { CircleDetail, User, ContactLink } from "../types";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { showToast } from "../components/Toast";

export const CircleDetailPage: Component = () => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [showEditModal, setShowEditModal] = createSignal(false);
  const [showMembersModal, setShowMembersModal] = createSignal(false);
  const [showContactsModal, setShowContactsModal] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editDesc, setEditDesc] = createSignal("");
  const [error, setError] = createSignal("");

  // For member/contact selection
  const [allFriends, setAllFriends] = createSignal<User[]>([]);
  const [selectedMembers, setSelectedMembers] = createSignal<Set<string>>(new Set());
  const [allContacts, setAllContacts] = createSignal<ContactLink[]>([]);
  const [selectedContacts, setSelectedContacts] = createSignal<Set<string>>(new Set());

  async function loadDetail(): Promise<CircleDetail | null> {
    const res = await api(`/users/me/circles/${params.id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.circle;
  }

  const [circle, { refetch }] = createResource(() => params.id, loadDetail);

  function openEdit() {
    const c = circle();
    if (!c) return;
    setEditName(c.name);
    setEditDesc(c.description || "");
    setError("");
    setShowEditModal(true);
  }

  async function submitEdit() {
    if (!editName().trim()) { setError("Name is required"); return; }
    const res = await api(`/users/me/circles/${params.id}`, {
      method: "PATCH",
      body: { name: editName(), description: editDesc() },
    });
    if (res.ok) {
      setShowEditModal(false);
      refetch();
      showToast("Circle updated");
    } else {
      const d = await res.json();
      setError(d.error || "Failed");
    }
  }

  async function deleteCircle() {
    if (!confirm("Delete this circle? Members won't be affected.")) return;
    const res = await api(`/users/me/circles/${params.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Circle deleted");
      navigate("/circles", { replace: true });
    }
  }

  async function openEditMembers() {
    // Load all friends
    const res = await api("/users/me/friends?limit=100");
    if (res.ok) {
      const d = await res.json();
      setAllFriends(d.friends || []);
    }
    const c = circle();
    const currentIds = new Set((c?.members || []).map((m) => m.id));
    setSelectedMembers(currentIds);
    setShowMembersModal(true);
  }

  async function submitMembers() {
    const res = await api(`/users/me/circles/${params.id}/members`, {
      method: "PUT",
      body: { memberIds: Array.from(selectedMembers()) },
    });
    if (res.ok) {
      setShowMembersModal(false);
      refetch();
      showToast("Members updated");
    }
  }

  async function openEditContacts() {
    // Load own opt-in contacts
    const res = await api("/users/me/contacts");
    if (res.ok) {
      const d = await res.json();
      const optIn = (d.contacts || []).filter((c: ContactLink) => c.sharedByDefault === false);
      setAllContacts(optIn);
    }
    const c = circle();
    const currentIds = new Set((c?.contacts || []).map((ct) => ct.id));
    setSelectedContacts(currentIds);
    setShowContactsModal(true);
  }

  async function submitContacts() {
    const res = await api(`/users/me/circles/${params.id}/contacts`, {
      method: "PUT",
      body: { contactIds: Array.from(selectedContacts()) },
    });
    if (res.ok) {
      setShowContactsModal(false);
      refetch();
      showToast("Contact grants updated");
    }
  }

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleContact(id: string) {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div class="view">
      <div class="top-bar">
        <div class="top-bar-row">
          <button class="back-btn" onClick={() => navigate("/circles")}>
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4L5 9l6 5" /></svg>
            Back
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            <button class="btn btn-sm btn-secondary" onClick={openEdit}>Edit</button>
            <button class="btn btn-sm btn-secondary" style={{ color: "var(--rose-500)" }} onClick={deleteCircle}>Delete</button>
          </div>
        </div>
      </div>

      <Show when={!circle.loading && circle()} fallback={<div class="loading-center"><div class="spinner" /></div>}>
        {(c) => (
          <>
            <div style={{ padding: "16px 0" }}>
              <h2>{c().name}</h2>
              <Show when={c().description}>
                <p style={{ color: "var(--stone-400)", "font-size": "0.85rem" }}>{c().description}</p>
              </Show>
            </div>

            <div class="section-label">
              Members ({c().members.length})
              <button class="btn btn-sm" style={{ "margin-left": "auto", "font-size": "0.75rem" }} onClick={openEditMembers}>
                Edit
              </button>
            </div>
            <Show when={c().members.length > 0} fallback={
              <div class="empty-state"><p>No members yet</p></div>
            }>
              <For each={c().members}>
                {(m) => (
                  <div class="member-row">
                    <Avatar displayName={m.displayName} id={m.id} avatarUrl={m.avatarUrl} size="sm" />
                    <div>
                      <div style={{ "font-weight": "500" }}>{m.displayName}</div>
                      <div style={{ "font-size": "0.78rem", color: "var(--stone-400)" }}>@{m.handle}</div>
                    </div>
                  </div>
                )}
              </For>
            </Show>

            <div class="section-label" style={{ "margin-top": "16px" }}>
              Shared Contacts ({c().contacts.length})
              <button class="btn btn-sm" style={{ "margin-left": "auto", "font-size": "0.75rem" }} onClick={openEditContacts}>
                Edit
              </button>
            </div>
            <Show when={c().contacts.length > 0} fallback={
              <div class="empty-state"><p>No contacts shared with this circle</p></div>
            }>
              <For each={c().contacts}>
                {(ct) => (
                  <div class="member-row">
                    <span class="circle-chip">{ct.type}</span>
                    <div>
                      <div style={{ "font-weight": "500" }}>{ct.label}</div>
                      <div style={{ "font-size": "0.78rem", color: "var(--stone-400)" }}>{ct.value}</div>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </>
        )}
      </Show>

      {/* Edit Circle Modal */}
      <Modal open={showEditModal()} onClose={() => setShowEditModal(false)}>
        <h3>Edit Circle</h3>
        <div class="form-field">
          <label>Name</label>
          <input type="text" value={editName()} onInput={(e) => setEditName(e.currentTarget.value)} />
        </div>
        <div class="form-field">
          <label>Description</label>
          <input type="text" value={editDesc()} onInput={(e) => setEditDesc(e.currentTarget.value)} />
        </div>
        <Show when={error()}><p class="form-error">{error()}</p></Show>
        <div class="form-actions">
          <button class="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
          <button class="btn btn-primary" onClick={submitEdit}>Save</button>
        </div>
      </Modal>

      {/* Edit Members Modal */}
      <Modal open={showMembersModal()} onClose={() => setShowMembersModal(false)}>
        <h3>Select Members</h3>
        <div class="checkbox-list">
          <For each={allFriends()}>
            {(f) => (
              <label class="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedMembers().has(f.id)}
                  onChange={() => toggleMember(f.id)}
                />
                <Avatar displayName={f.displayName} id={f.id} avatarUrl={f.avatarUrl} size="sm" />
                <span>{f.displayName}</span>
              </label>
            )}
          </For>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onClick={() => setShowMembersModal(false)}>Cancel</button>
          <button class="btn btn-primary" onClick={submitMembers}>Save</button>
        </div>
      </Modal>

      {/* Edit Contact Grants Modal */}
      <Modal open={showContactsModal()} onClose={() => setShowContactsModal(false)}>
        <h3>Share Contacts with Circle</h3>
        <p style={{ "font-size": "0.78rem", color: "var(--stone-400)", "margin-bottom": "12px" }}>
          Only opt-in contacts (shared by default = off) appear here
        </p>
        <Show when={allContacts().length > 0} fallback={
          <div class="empty-state"><p>No opt-in contacts to share</p></div>
        }>
          <div class="checkbox-list">
            <For each={allContacts()}>
              {(c) => (
                <label class="checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedContacts().has(c.id)}
                    onChange={() => toggleContact(c.id)}
                  />
                  <span class="circle-chip">{c.type}</span>
                  <span>{c.label}: {c.value}</span>
                </label>
              )}
            </For>
          </div>
        </Show>
        <div class="form-actions">
          <button class="btn btn-secondary" onClick={() => setShowContactsModal(false)}>Cancel</button>
          <button class="btn btn-primary" onClick={submitContacts}>Save</button>
        </div>
      </Modal>
    </div>
  );
};
