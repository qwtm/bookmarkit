import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, Modal } from "./DesignSystem.jsx";
import HelpModal from "./HelpModal.jsx";
import MessageModal from "./MessageModal.jsx";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

const dialog = () => screen.getByRole("dialog");

describe("Modal keyboard and focus behaviour (#27, #23)", () => {
  it("moves focus into the dialog and restores it on close", () => {
    const Host = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          {open && (
            <Modal title="Options" onClose={() => setOpen(false)}>
              <Button>Inside</Button>
            </Modal>
          )}
        </>
      );
    };
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Open" });

    opener.focus();
    fireEvent.click(opener);
    expect(dialog().contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on Escape from anywhere inside", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Options" onClose={onClose}>
        <input aria-label="a field" />
      </Modal>
    );

    fireEvent.keyDown(screen.getByLabelText("a field"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(<Modal title="Options" onClose={onClose} />);

    for (const key of ["Enter", "Tab", "e", "d"]) {
      fireEvent.keyDown(dialog(), { key });
    }

    expect(onClose).not.toHaveBeenCalled();
  });

  // Escape belongs to the dialog holding focus. Before this, each modal listened
  // on the document, so the app's own Escape shortcut ran behind an open dialog
  // and a nested dialog closed its parent with it.
  it("keeps Escape from reaching the app behind it", () => {
    const appEscape = vi.fn();
    render(
      <div onKeyDown={(event) => event.key === "Escape" && appEscape()}>
        <Modal title="Options" onClose={() => {}}>
          <Button>Inside</Button>
        </Modal>
      </div>
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Inside" }), { key: "Escape" });

    expect(appEscape).not.toHaveBeenCalled();
  });

  it("closes only the nested dialog", () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(
      <>
        <Modal title="Options" onClose={onOuterClose}>
          <Button>Outer</Button>
        </Modal>
        <Modal title="Theme File Format" onClose={onInnerClose}>
          <Button>Inner</Button>
        </Modal>
      </>
    );

    // The nested dialog took focus when it mounted, which is what makes it the
    // one Escape reaches.
    fireEvent.keyDown(document.activeElement, { key: "Escape" });

    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
  });

  it("routes Escape through the same guard as the scrim", () => {
    const onClose = vi.fn();
    const onScrimClick = vi.fn();
    render(<Modal title="Editing" onClose={onClose} onScrimClick={onScrimClick} />);

    fireEvent.keyDown(dialog(), { key: "Escape" });

    expect(onScrimClick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("wraps Tab inside the dialog", () => {
    render(
      <Modal title="Options" onClose={() => {}}>
        <Button>First</Button>
        <Button>Last</Button>
      </Modal>
    );
    const focusable = Array.from(dialog().querySelectorAll("button"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

// Every dialog gets the same keyboard contract from the wrapper, including the
// three that used to hand-roll it and the ones that had no way out at all.
describe("every dialog closes on Escape (#23)", () => {
  it("help", () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    fireEvent.keyDown(document.activeElement, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("message", () => {
    const onClose = vi.fn();
    render(<MessageModal message="Saved" type="success" onClose={onClose} />);

    fireEvent.keyDown(document.activeElement, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("delete confirmation, unless a deletion is in flight", () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <DeleteConfirmModal message="Delete 2 bookmarks?" onCancel={onCancel} onConfirm={vi.fn()} />
    );

    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <DeleteConfirmModal
        message="Delete 2 bookmarks?"
        onCancel={onCancel}
        onConfirm={vi.fn()}
        isLoading
      />
    );
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
