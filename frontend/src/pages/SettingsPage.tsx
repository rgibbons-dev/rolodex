import { Component, Show, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../api/client";
import { clearTokens, me } from "../stores/auth";
import { showToast } from "../components/Toast";

export const SettingsPage: Component = () => {
  const navigate = useNavigate();
  const [isPublic, setIsPublic] = createSignal(me()?.isPublic ?? true);

  async function editProfile() {
    const current = me();
    const name = prompt("Display name:", current?.displayName || "");
    if (name === null) return;
    const bio = prompt("Bio:", current?.bio || "");
    if (bio === null) return;

    const res = await api("/users/me", {
      method: "PATCH",
      body: { displayName: name, bio },
    });
    if (res.ok) showToast("Profile updated");
    else showToast("Failed to update");
  }

  async function togglePrivacy() {
    const newVal = !isPublic();
    const res = await api("/settings", {
      method: "PATCH",
      body: { isPublic: newVal },
    });
    if (res.ok) {
      setIsPublic(newVal);
      showToast(newVal ? "Profile is now public" : "Profile is now private");
    }
  }

  async function exportVcf() {
    const res = await api("/export/vcf");
    if (!res.ok) { showToast("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rolodex-contacts.vcf";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported VCF");
  }

  async function exportCsv() {
    const res = await api("/export/csv");
    if (!res.ok) { showToast("Export failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rolodex-contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported CSV");
  }

  function doSignOut() {
    clearTokens();
    navigate("/auth", { replace: true });
  }

  return (
    <div class="view">
      <div class="top-bar">
        <h1>Settings</h1>
      </div>

      <div class="settings-section">
        <div class="section-label">Account</div>
        <div class="settings-group">
          <div class="settings-row" onClick={editProfile}>
            <span class="settings-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M12.5 3.5l2 2L6 14H4v-2l8.5-8.5z" />
              </svg>
            </span>
            <span>Edit Profile</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-label">Circles</div>
        <div class="settings-group">
          <div class="settings-row" onClick={() => navigate("/circles")}>
            <span class="settings-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <circle cx="9" cy="9" r="7" /><circle cx="9" cy="9" r="3" />
              </svg>
            </span>
            <span>Circles</span>
            <span class="settings-detail">Manage friend groups and contact sharing</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-label">Notifications</div>
        <div class="settings-group">
          <div class="settings-row" onClick={() => navigate("/notifications")}>
            <span class="settings-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M9 2a5 5 0 0 0-5 5c0 4-2 5-2 5h14s-2-1-2-5a5 5 0 0 0-5-5M7.5 15a1.5 1.5 0 0 0 3 0" />
              </svg>
            </span>
            <span>Notifications</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-label">Data</div>
        <div class="settings-group">
          <div class="settings-row" onClick={exportVcf}>
            <span class="settings-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M3 12l6 4 6-4M3 8l6 4 6-4M3 4l6 4 6-4" />
              </svg>
            </span>
            <span>Export VCF</span>
          </div>
          <div class="settings-row" onClick={exportCsv}>
            <span class="settings-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M4 2h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM7 6h7M7 10h7M7 14h4" />
              </svg>
            </span>
            <span>Export CSV</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="section-label">Privacy</div>
        <div class="settings-group">
          <div class="settings-row" onClick={togglePrivacy}>
            <span class="settings-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <Show when={isPublic()} fallback={<><path d="M2 9s3-6 7-6 7 6 7 6-3 6-7 6-7-6-7-6Z" /><line x1="3" y1="15" x2="15" y2="3" /></>}>
                  <path d="M2 9s3-6 7-6 7 6 7 6-3 6-7 6-7-6-7-6Z" /><circle cx="9" cy="9" r="2.5" />
                </Show>
              </svg>
            </span>
            <span>Profile {isPublic() ? "Public" : "Private"}</span>
            <span class="settings-detail">Tap to toggle</span>
          </div>
        </div>
      </div>

      <div class="settings-section" style={{ "margin-top": "24px" }}>
        <button class="btn btn-secondary" style={{ width: "100%" }} onClick={doSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
};
