import { Component, createSignal, createResource, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import type { User } from "../types";
import { PersonRow } from "../components/PersonRow";
import { showToast } from "../components/Toast";

async function loadSuggestions(): Promise<User[]> {
  const res = await api("/discover/suggestions?limit=20");
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions || [];
}

export const DiscoverPage: Component = () => {
  const navigate = useNavigate();
  const [suggestions] = createResource(loadSuggestions);
  const [searchResults, setSearchResults] = createSignal<User[] | null>(null);
  const [searchTerm, setSearchTerm] = createSignal("");
  const [searching, setSearching] = createSignal(false);

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function doSearch(query: string) {
    setSearchTerm(query);
    if (searchTimer) clearTimeout(searchTimer);
    if (!query.trim()) { setSearchResults(null); return; }
    searchTimer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api(`/discover/search?q=${encodeURIComponent(query)}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch {}
      setSearching(false);
    }, 300);
  }

  async function sendRequest(userId: string) {
    try {
      const res = await api(`/friends/request/${userId}`, { method: "POST" });
      if (res.ok) {
        showToast("Friend request sent!");
      } else {
        const d = await res.json();
        showToast(d.error || "Failed");
      }
    } catch { showToast("Network error"); }
  }

  const displayList = () => searchResults() ?? suggestions() ?? [];

  return (
    <div class="view">
      <div class="top-bar">
        <h1>Discover</h1>
        <div class="search-wrap">
          <svg class="search-icon" width="16" height="16" fill="none" stroke="var(--stone-400)" stroke-width="2" stroke-linecap="round">
            <circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" />
          </svg>
          <input
            class="search-input"
            type="text"
            placeholder="Search people..."
            value={searchTerm()}
            onInput={(e) => doSearch(e.currentTarget.value)}
          />
        </div>
      </div>

      <Show when={!suggestions.loading && !searching()} fallback={<div class="loading-center"><div class="spinner" /></div>}>
        <Show when={displayList().length > 0} fallback={
          <div class="empty-state"><p>No one found</p></div>
        }>
          <div class="section-label">{searchResults() ? "Search results" : "Suggested"}</div>
          <For each={displayList()}>
            {(user) => (
              <PersonRow
                user={user}
                onClick={() => navigate(`/profile/${user.handle}`)}
                extra={
                  <button class="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); sendRequest(user.id); }}>
                    Add
                  </button>
                }
              />
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
};
