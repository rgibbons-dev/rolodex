import { Component, Show } from "solid-js";
import type { ContactLink } from "../types";
import { showToast } from "./Toast";

const ICONS: Record<string, string> = {
  phone: "\u{1F4F1}", email: "\u{2709}\u{FE0F}", whatsapp: "\u{1F4AC}", telegram: "\u{2708}\u{FE0F}",
  signal: "\u{1F510}", snapchat: "\u{1F47B}", instagram: "\u{1F4F7}", custom: "\u{1F517}",
};

interface ContactLinkRowProps {
  contact: ContactLink;
  editable?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const ContactLinkRow: Component<ContactLinkRowProps> = (props) => {
  const icon = () => ICONS[props.contact.type] || ICONS.custom;

  function copyValue(e: Event) {
    e.preventDefault();
    navigator.clipboard?.writeText(props.contact.value);
    showToast(`Copied ${props.contact.label}`);
  }

  return (
    <a
      class={`contact-link${props.editable ? " editable" : ""}`}
      href="#"
      onClick={copyValue}
    >
      <div class={`contact-icon ${props.contact.type}`}>{icon()}</div>
      <div class="contact-text">
        <div class="contact-label">
          {props.contact.label}
          <Show when={props.editable && props.contact.sharedByDefault === false}>
            <span class="opt-in-badge">Opt-in</span>
          </Show>
          <Show when={props.editable && props.contact.visibility === "everyone"}>
            <span class="vis-label">{"\u00B7"} Public</span>
          </Show>
        </div>
        <div class="contact-value">{props.contact.value}</div>
      </div>
      <Show when={props.editable}>
        <div class="contact-actions">
          <button class="edit-btn" title="Edit" onClick={(e) => { e.preventDefault(); e.stopPropagation(); props.onEdit?.(); }}>
            {"\u270F\u{FE0F}"}
          </button>
          <button class="del-btn" title="Delete" onClick={(e) => { e.preventDefault(); e.stopPropagation(); props.onDelete?.(); }}>
            {"\u2715"}
          </button>
        </div>
      </Show>
    </a>
  );
};
