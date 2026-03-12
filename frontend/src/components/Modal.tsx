import { Component, JSX, Show } from "solid-js";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: JSX.Element;
}

export const Modal: Component<ModalProps> = (props) => {
  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      props.onClose();
    }
  }

  return (
    <Show when={props.open}>
      <div class="modal-overlay open" onClick={handleOverlayClick}>
        <div class="modal modal-form">
          {props.children}
        </div>
      </div>
    </Show>
  );
};
