import { Component, Show, createSignal, createEffect, JSX } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { isAuthenticated } from "./stores/auth";
import { BottomNav, type NavTab } from "./components/BottomNav";
import { Toast } from "./components/Toast";
import { api } from "./api/client";

interface AppProps {
  children?: JSX.Element;
}

const App: Component<AppProps> = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = createSignal(0);

  // Auth guard
  createEffect(() => {
    const path = location.pathname;
    if (!isAuthenticated() && path !== "/auth") {
      navigate("/auth", { replace: true });
    }
    if (isAuthenticated() && path === "/auth") {
      navigate("/", { replace: true });
    }
  });

  // Load unread notifications count
  createEffect(async () => {
    if (!isAuthenticated()) return;
    try {
      const res = await api("/users/me/notifications?limit=1");
      if (res.ok) {
        const d = await res.json();
        setUnreadCount(d.unreadCount || 0);
      }
    } catch {}
  });

  const activeTab = (): NavTab => {
    const path = location.pathname;
    if (path === "/" || path === "/profile") return "me";
    if (path.startsWith("/friends")) return "friends";
    if (path.startsWith("/discover")) return "discover";
    if (path.startsWith("/settings") || path.startsWith("/circles") || path.startsWith("/notifications")) return "settings";
    return "me";
  };

  function handleNav(tab: NavTab) {
    const routes: Record<NavTab, string> = {
      me: "/",
      friends: "/friends",
      discover: "/discover",
      settings: "/settings",
    };
    navigate(routes[tab]);
  }

  const showNav = () => {
    const path = location.pathname;
    return isAuthenticated() && path !== "/auth";
  };

  return (
    <div class="app-shell">
      {props.children}

      <Show when={showNav()}>
        <BottomNav active={activeTab()} onNavigate={handleNav} unreadCount={unreadCount()} />
      </Show>

      <Toast />
    </div>
  );
};

export default App;
