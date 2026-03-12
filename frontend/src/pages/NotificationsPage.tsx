import { Component, createResource, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import type { Notification } from "../types";
import { showToast } from "../components/Toast";

async function loadNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const res = await api("/users/me/notifications?limit=50");
  if (!res.ok) return { notifications: [], unreadCount: 0 };
  return res.json();
}

export const NotificationsPage: Component = () => {
  const navigate = useNavigate();
  const [data, { refetch }] = createResource(loadNotifications);

  async function markRead(id: string) {
    await api(`/users/me/notifications/${id}/read`, { method: "POST" });
    refetch();
  }

  async function markAllRead() {
    await api("/users/me/notifications/read-all", { method: "POST" });
    refetch();
    showToast("All marked read");
  }

  return (
    <div class="view">
      <div class="top-bar">
        <div class="top-bar-row">
          <button class="back-btn" onClick={() => navigate("/settings")}>
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4L5 9l6 5" /></svg>
            Back
          </button>
          <button class="btn btn-sm btn-secondary" onClick={markAllRead}>Mark all read</button>
        </div>
        <h1 style={{ "margin-top": "8px" }}>Notifications</h1>
      </div>

      <Show when={!data.loading} fallback={<div class="loading-center"><div class="spinner" /></div>}>
        <Show when={(data()?.notifications || []).length > 0} fallback={
          <div class="empty-state"><p>No notifications</p></div>
        }>
          <For each={data()?.notifications}>
            {(n) => (
              <div
                class={`settings-row${n.read ? "" : " unread"}`}
                onClick={() => !n.read && markRead(n.id)}
              >
                <div>
                  <div style={{ "font-weight": n.read ? "400" : "600" }}>{n.message}</div>
                  <div style={{ "font-size": "0.72rem", color: "var(--stone-400)" }}>
                    {new Date(n.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Show when={!n.read}>
                  <span class="notif-dot" />
                </Show>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
};
