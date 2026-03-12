import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Avatar } from "../components/Avatar";
import { ContactLinkRow } from "../components/ContactLinkRow";
import { PersonRow } from "../components/PersonRow";
import { BottomNav } from "../components/BottomNav";
import { Modal } from "../components/Modal";
import { Toast, showToast } from "../components/Toast";

describe("Avatar", () => {
  it("renders initials when no avatarUrl", () => {
    render(() => <Avatar displayName="Jordan Rivera" id="123" />);
    expect(screen.getByText("JR")).toBeInTheDocument();
  });

  it("renders image when avatarUrl provided", () => {
    render(() => <Avatar displayName="Jordan" id="123" avatarUrl="/uploads/avatar.jpg" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/uploads/avatar.jpg");
  });

  it("applies size class", () => {
    const { container } = render(() => <Avatar displayName="J R" id="123" size="xl" />);
    expect(container.querySelector(".avatar.xl")).toBeInTheDocument();
  });
});

describe("ContactLinkRow", () => {
  it("renders label and value", () => {
    render(() => (
      <ContactLinkRow
        contact={{ id: "1", type: "phone", label: "Phone", value: "+1234", sortOrder: 0 }}
      />
    ));
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("+1234")).toBeInTheDocument();
  });

  it("shows opt-in badge when sharedByDefault is false and editable", () => {
    render(() => (
      <ContactLinkRow
        contact={{ id: "1", type: "phone", label: "Phone", value: "+1234", sortOrder: 0, sharedByDefault: false }}
        editable
      />
    ));
    expect(screen.getByText("Opt-in")).toBeInTheDocument();
  });

  it("shows edit and delete buttons when editable", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(() => (
      <ContactLinkRow
        contact={{ id: "1", type: "phone", label: "Phone", value: "+1234", sortOrder: 0 }}
        editable
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ));
    fireEvent.click(screen.getByTitle("Edit"));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Delete"));
    expect(onDelete).toHaveBeenCalled();
  });
});

describe("PersonRow", () => {
  it("renders user info", () => {
    render(() => (
      <PersonRow
        user={{ id: "1", handle: "bob", displayName: "Bob Jones", bio: "", avatarUrl: null, isPublic: true }}
      />
    ));
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("@bob")).toBeInTheDocument();
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(() => (
      <PersonRow
        user={{ id: "1", handle: "bob", displayName: "Bob", bio: "", avatarUrl: null, isPublic: true }}
        onClick={onClick}
      />
    ));
    fireEvent.click(screen.getByText("Bob"));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("BottomNav", () => {
  it("renders four nav buttons", () => {
    render(() => <BottomNav active="me" />);
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.getByText("Friends")).toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("marks active tab", () => {
    const { container } = render(() => <BottomNav active="friends" />);
    const activeBtn = container.querySelector(".nav-btn.active");
    expect(activeBtn).toBeInTheDocument();
    expect(activeBtn?.textContent).toContain("Friends");
  });

  it("shows notification dot", () => {
    const { container } = render(() => <BottomNav active="me" unreadCount={3} />);
    expect(container.querySelector(".notif-dot")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("renders children when open", () => {
    render(() => (
      <Modal open={true} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    ));
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does not render children when closed", () => {
    render(() => (
      <Modal open={false} onClose={() => {}}>
        <p>Hidden content</p>
      </Modal>
    ));
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  });

  it("calls onClose when overlay clicked", () => {
    const onClose = vi.fn();
    const { container } = render(() => (
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    ));
    const overlay = container.querySelector(".modal-overlay");
    if (overlay) fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Toast", () => {
  it("renders and shows toast message", async () => {
    render(() => <Toast />);
    showToast("Copied!");
    // Toast should appear
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });
});
