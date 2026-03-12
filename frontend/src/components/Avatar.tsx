import { Component, Show } from "solid-js";

// Deterministic color from user ID
const COLORS: [string, string][] = [
  ["#92400e", "#fef3c7"], ["#065f46", "#d1fae5"], ["#1e40af", "#dbeafe"],
  ["#6b21a8", "#f3e8ff"], ["#9f1239", "#ffe4e6"], ["#854d0e", "#fef9c3"],
  ["#115e59", "#ccfbf1"], ["#3730a3", "#e0e7ff"], ["#86198f", "#fae8ff"],
  ["#991b1b", "#fee2e2"],
];

function userColor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface AvatarProps {
  displayName: string;
  id: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "xl";
}

export const Avatar: Component<AvatarProps> = (props) => {
  const size = () => props.size || "md";
  const [fg, bg] = userColor(props.id);

  return (
    <div class={`avatar ${size()}`} style={{ background: props.avatarUrl ? "transparent" : bg, color: fg }}>
      <Show when={props.avatarUrl} fallback={<span>{initials(props.displayName)}</span>}>
        <img src={props.avatarUrl!} alt={props.displayName} role="img" />
      </Show>
    </div>
  );
};
