import { Component, Show } from "solid-js";
import { createSignal } from "solid-js";

const [toastMsg, setToastMsg] = createSignal("");
const [toastVisible, setToastVisible] = createSignal(false);

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string) {
  if (toastTimer) clearTimeout(toastTimer);
  setToastMsg(msg);
  setToastVisible(true);
  toastTimer = setTimeout(() => setToastVisible(false), 2200);
}

export const Toast: Component = () => {
  return (
    <Show when={toastVisible()}>
      <div class="toast show">{toastMsg()}</div>
    </Show>
  );
};
