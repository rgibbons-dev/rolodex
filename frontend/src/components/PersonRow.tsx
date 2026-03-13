import { Component, JSX } from "solid-js";
import { Avatar } from "./Avatar";
import type { User } from "../types";

interface PersonRowProps {
  user: User;
  extra?: JSX.Element;
  onClick?: () => void;
}

export const PersonRow: Component<PersonRowProps> = (props) => {
  return (
    <div class="person-row" onClick={props.onClick}>
      <Avatar displayName={props.user.displayName} id={props.user.id} avatarUrl={props.user.avatarUrl} size="sm" />
      <div class="person-info">
        <div class="person-name">{props.user.displayName}</div>
        <div class="person-handle">@{props.user.handle}</div>
        {props.extra}
      </div>
      <svg class="chevron" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 3l5 5-5 5" />
      </svg>
    </div>
  );
};
