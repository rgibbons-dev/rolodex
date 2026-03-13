import { Component, Show } from "solid-js";

export type NavTab = "me" | "friends" | "discover" | "settings";

interface BottomNavProps {
  active: NavTab;
  onNavigate?: (tab: NavTab) => void;
  unreadCount?: number;
}

export const BottomNav: Component<BottomNavProps> = (props) => {
  const tabs: { key: NavTab; label: string; icon: string }[] = [
    { key: "me", label: "Me", icon: "M9 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 16.5c0-3 3-5 7-5s7 2 7 5" },
    { key: "friends", label: "Friends", icon: "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1 16c0-2.5 2.5-4.5 7-4.5M14.5 7.5a2.5 2.5 0 1 0 0-5M17 16c0-2 -1.5-3.5-4-4.2" },
    { key: "discover", label: "Discover", icon: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM13 13l4.5 4.5" },
    { key: "settings", label: "Settings", icon: "M9 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" },
  ];

  return (
    <nav class="bottom-nav">
      {tabs.map((tab) => (
        <button
          class={`nav-btn${props.active === tab.key ? " active" : ""}`}
          onClick={() => props.onNavigate?.(tab.key)}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d={tab.icon} />
          </svg>
          {tab.label}
          <Show when={tab.key === "settings" && (props.unreadCount ?? 0) > 0}>
            <span class="notif-dot" />
          </Show>
        </button>
      ))}
    </nav>
  );
};
