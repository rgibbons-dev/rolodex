import { Component, createSignal, createResource, For, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import type { User } from "../types";
import { PersonRow } from "../components/PersonRow";

async function loadFriends(): Promise<{ friends: User[]; total: number }> {
  const res = await api("/users/me/friends?limit=100");
  if (!res.ok) return { friends: [], total: 0 };
  return res.json();
}

export const FriendsPage: Component = () => {
  const navigate = useNavigate();
  const [friends, { refetch }] = createResource(loadFriends);
  const [search, setSearch] = createSignal("");

  const filtered = () => {
    const term = search().toLowerCase();
    const list = friends()?.friends || [];
    if (!term) return list;
    return list.filter((f) =>
      f.displayName.toLowerCase().includes(term) || f.handle.toLowerCase().includes(term)
    );
  };

  return (
    <div class="view">
      <div class="top-bar">
        <h1>Friends</h1>
        <div class="search-wrap">
          <svg class="search-icon" width="16" height="16" fill="none" stroke="var(--stone-400)" stroke-width="2" stroke-linecap="round">
            <circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" />
          </svg>
          <input
            class="search-input"
            type="text"
            placeholder="Search friends..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
      </div>

      <Show when={!friends.loading} fallback={<div class="loading-center"><div class="spinner" /></div>}>
        <Show when={filtered().length > 0} fallback={
          <div class="empty-state">
            <p>{search() ? "No friends match your search" : "No friends yet"}</p>
          </div>
        }>
          <div class="section-label">{friends()?.total ?? 0} friends</div>
          <For each={filtered()}>
            {(friend) => (
              <PersonRow
                user={friend}
                onClick={() => navigate(`/profile/${friend.handle}`)}
              />
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
};
