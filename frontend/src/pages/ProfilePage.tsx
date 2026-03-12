import { Component, createResource, For, Show, createSignal } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import type { Profile, User } from "../types";
import { Avatar } from "../components/Avatar";
import { ContactLinkRow } from "../components/ContactLinkRow";
import { PersonRow } from "../components/PersonRow";
import { showToast } from "../components/Toast";

export const ProfilePage: Component = () => {
  const params = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const [friends, setFriends] = createSignal<User[]>([]);
  const [mutuals, setMutuals] = createSignal<User[]>([]);
  const [requestSent, setRequestSent] = createSignal(false);

  async function loadProfile(): Promise<Profile | null> {
    const res = await api(`/users/${params.handle}`);
    if (!res.ok) return null;
    const profile = await res.json();

    // Load friends and mutuals in parallel
    const [friendsRes, mutualsRes] = await Promise.all([
      api(`/users/${params.handle}/friends?limit=6`),
      api(`/users/${params.handle}/mutuals`),
    ]);

    if (friendsRes.ok) {
      const d = await friendsRes.json();
      setFriends(d.friends || []);
    }
    if (mutualsRes.ok) {
      const d = await mutualsRes.json();
      setMutuals(d.mutuals || []);
    }

    return profile;
  }

  const [profile] = createResource(() => params.handle, loadProfile);

  async function sendRequest() {
    const p = profile();
    if (!p) return;
    try {
      const res = await api(`/friends/request/${p.id}`, { method: "POST" });
      if (res.ok) {
        setRequestSent(true);
        showToast("Friend request sent!");
      } else {
        const d = await res.json();
        showToast(d.error || "Failed");
      }
    } catch { showToast("Network error"); }
  }

  return (
    <div class="view">
      <div class="top-bar">
        <button class="back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M11 4L5 9l6 5" />
          </svg>
          Back
        </button>
      </div>

      <Show when={!profile.loading && profile()} fallback={<div class="loading-center"><div class="spinner" /></div>}>
        {(p) => (
          <>
            <div class="profile-header fade-in-up">
              <Avatar displayName={p().displayName} id={p().id} avatarUrl={p().avatarUrl} size="xl" />
              <div class="profile-name">{p().displayName}</div>
              <div class="profile-handle">@{p().handle}</div>
              <div class="profile-bio">{p().bio}</div>

              <Show when={p().relationship === "accepted"}>
                <span class="friend-badge is-friend">Friends</span>
              </Show>
              <Show when={p().relationship === "pending" || requestSent()}>
                <span class="friend-badge pending">Pending</span>
              </Show>
              <Show when={!p().relationship && !requestSent()}>
                <button class="btn btn-primary btn-sm" onClick={sendRequest}>Add Friend</button>
              </Show>
            </div>

            <Show when={(p().contactLinks?.length ?? 0) > 0}>
              <div class="section-label">Contact Info</div>
              <div class="contact-grid">
                <For each={p().contactLinks}>
                  {(c) => <ContactLinkRow contact={c} />}
                </For>
              </div>
            </Show>

            <Show when={mutuals().length > 0}>
              <div class="section-label">Mutual Friends</div>
              <For each={mutuals()}>
                {(m) => <PersonRow user={m} onClick={() => navigate(`/profile/${m.handle}`)} />}
              </For>
            </Show>

            <Show when={friends().length > 0}>
              <div class="section-label">Friends</div>
              <For each={friends()}>
                {(f) => <PersonRow user={f} onClick={() => navigate(`/profile/${f.handle}`)} />}
              </For>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
};
