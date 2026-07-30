import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts.js";

const Harness = ({ bindings, enabled = true }) => {
  useKeyboardShortcuts(bindings, { enabled });
  return (
    <div>
      <button type="button">a button</button>
      <input aria-label="search" />
      <textarea aria-label="notes" />
      <div aria-label="editor" contentEditable suppressContentEditableWarning>
        <span aria-label="editor text">typed</span>
      </div>
    </div>
  );
};

const asMac = (yes) => {
  Object.defineProperty(navigator, "userAgent", {
    value: yes
      ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
      : "Mozilla/5.0 (Windows NT 10.0)",
    configurable: true,
  });
};

afterEach(() => {
  asMac(false);
});

describe("useKeyboardShortcuts (#27)", () => {
  it("runs the binding for a plain key", () => {
    const toggle = vi.fn();
    render(<Harness bindings={{ h: toggle, Escape: vi.fn() }} />);

    fireEvent.keyDown(window, { key: "h" });
    fireEvent.keyDown(window, { key: "H" });

    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("keeps a plain key and its Mod combo apart", () => {
    const plain = vi.fn();
    const combo = vi.fn();
    render(<Harness bindings={{ d: plain, "Mod+d": combo }} />);

    fireEvent.keyDown(window, { key: "d" });
    expect([plain.mock.calls.length, combo.mock.calls.length]).toEqual([1, 0]);

    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect([plain.mock.calls.length, combo.mock.calls.length]).toEqual([1, 1]);
  });

  it("reads Mod as Command on a Mac and Control elsewhere", () => {
    const combo = vi.fn();
    const plain = vi.fn();
    asMac(true);
    render(<Harness bindings={{ "Mod+a": combo, a: plain }} />);

    fireEvent.keyDown(window, { key: "a", metaKey: true });
    expect(combo).toHaveBeenCalledTimes(1);

    // Control+A on a Mac is the caret shortcut, not ours, and is not a synonym.
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(combo).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });

  it("stays out of the way while the user is typing", () => {
    const handler = vi.fn();
    render(<Harness bindings={{ d: handler, Escape: handler }} />);

    for (const label of ["search", "notes", "editor", "editor text"]) {
      fireEvent.keyDown(screen.getByLabelText(label), { key: "d" });
      fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape" });
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it("still fires from a non-typing element", () => {
    const handler = vi.fn();
    render(<Harness bindings={{ d: handler }} />);

    fireEvent.keyDown(screen.getByRole("button"), { key: "d" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("binds nothing while disabled", () => {
    const handler = vi.fn();
    render(<Harness bindings={{ d: handler }} enabled={false} />);

    fireEvent.keyDown(window, { key: "d" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("leaves Alt combos alone", () => {
    const handler = vi.fn();
    render(<Harness bindings={{ d: handler, "Mod+d": handler }} />);

    fireEvent.keyDown(window, { key: "d", altKey: true });
    fireEvent.keyDown(window, { key: "d", altKey: true, ctrlKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  // The reason the hook keeps bindings in a ref: the old code carried an
  // eight-entry dependency array and resubscribed whenever any of it changed.
  it("sees current state without rebinding", () => {
    const listener = vi.spyOn(window, "addEventListener");
    const seen = [];
    const Counter = () => {
      const [count, setCount] = useState(0);
      useKeyboardShortcuts({
        d: () => seen.push(count),
        i: () => setCount((n) => n + 1),
      });
      return null;
    };
    render(<Counter />);
    const bindsAfterMount = listener.mock.calls.filter(([type]) => type === "keydown").length;

    fireEvent.keyDown(window, { key: "i" });
    fireEvent.keyDown(window, { key: "i" });
    fireEvent.keyDown(window, { key: "d" });

    expect(seen).toEqual([2]);
    expect(listener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(
      bindsAfterMount
    );
    listener.mockRestore();
  });

  it("unbinds on unmount", () => {
    const handler = vi.fn();
    const { unmount } = render(<Harness bindings={{ d: handler }} />);

    unmount();
    fireEvent.keyDown(window, { key: "d" });

    expect(handler).not.toHaveBeenCalled();
  });
});
