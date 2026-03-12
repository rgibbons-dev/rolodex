/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import App from "./App";
import { AuthPage } from "./pages/AuthPage";
import { MyProfilePage } from "./pages/MyProfilePage";
import { FriendsPage } from "./pages/FriendsPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { CirclesPage } from "./pages/CirclesPage";
import { CircleDetailPage } from "./pages/CircleDetailPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

render(() => (
  <Router root={App}>
    <Route path="/auth" component={AuthPage} />
    <Route path="/" component={MyProfilePage} />
    <Route path="/friends" component={FriendsPage} />
    <Route path="/discover" component={DiscoverPage} />
    <Route path="/profile/:handle" component={ProfilePage} />
    <Route path="/settings" component={SettingsPage} />
    <Route path="/circles" component={CirclesPage} />
    <Route path="/circles/:id" component={CircleDetailPage} />
    <Route path="/notifications" component={NotificationsPage} />
  </Router>
), root);
