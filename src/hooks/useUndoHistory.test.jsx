import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useUndoHistory } from "./useUndoHistory.js";

let history;

const Probe = ({ showMessage }) => {
  history = useUndoHistory(showMessage);
  return <span data-testid="offered">{history.offered?.label || "none"}</span>;
};

const offered = () => screen.getByTestId("offered").textContent;

const entry = (label, extra = {}) => ({
  label,
  undo: vi.fn().mockResolvedValue(undefined),
  ...extra,
});

beforeEach(() => {
  history = undefined;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useUndoHistory (#56)", () => {
  it("offers the write that just happened", () => {
    render(<Probe />);

    act(() => history.record(entry("Undo edit")));

    expect(offered()).toBe("Undo edit");
  });

  it("takes nothing for a write that had no inverse", () => {
    render(<Probe />);

    act(() => history.record(null));

    expect(offered()).toBe("none");
  });

  it("stops offering an additive write after a while", () => {
    render(<Probe />);

    act(() => history.record(entry("Undo import (3)")));
    act(() => vi.advanceTimersByTime(8000));

    expect(offered()).toBe("none");
  });

  it("keeps offering a destructive one until it is answered", () => {
    render(<Probe />);

    act(() => history.record(entry("Undo delete (2)", { destructive: true })));
    act(() => vi.advanceTimersByTime(60_000));

    expect(offered()).toBe("Undo delete (2)");
  });

  // The point of a history rather than a single offer: the toast going away is
  // not the user declining to undo.
  it("still undoes a write whose toast has gone", async () => {
    render(<Probe />);
    const edit = entry("Undo edit");

    act(() => history.record(edit));
    act(() => vi.advanceTimersByTime(8000));
    await act(async () => {
      await history.undoLast();
    });

    expect(edit.undo).toHaveBeenCalled();
  });

  it("does not discard the history when the toast is dismissed", async () => {
    render(<Probe />);
    const edit = entry("Undo edit");

    act(() => history.record(edit));
    act(() => history.dismiss());
    expect(offered()).toBe("none");

    await act(async () => {
      await history.undoLast();
    });
    expect(edit.undo).toHaveBeenCalled();
  });

  it("walks back through writes newest first", async () => {
    render(<Probe />);
    const order = [];
    const first = entry("first", { undo: vi.fn(async () => order.push("first")) });
    const second = entry("second", { undo: vi.fn(async () => order.push("second")) });

    act(() => history.record(first));
    act(() => history.record(second));
    await act(async () => {
      await history.undoLast();
      await history.undoLast();
    });

    expect(order).toEqual(["second", "first"]);
  });

  it("reports that there was nothing left to undo", async () => {
    render(<Probe />);
    let result;

    await act(async () => {
      result = await history.undoLast();
    });

    expect(result).toBe(false);
  });

  it("forgets writes older than the depth it keeps", async () => {
    render(<Probe />);
    const entries = Array.from({ length: 11 }, (_, i) => entry(`write ${i}`));

    for (const e of entries) act(() => history.record(e));
    await act(async () => {
      for (let i = 0; i < 11; i++) await history.undoLast();
    });

    // The eleventh write pushed the first out of the stack.
    expect(entries[0].undo).not.toHaveBeenCalled();
    expect(entries[1].undo).toHaveBeenCalled();
  });

  it("does not pop a second write while the first is still being undone", async () => {
    render(<Probe />);
    let release;
    const slow = entry("slow", { undo: vi.fn(() => new Promise((r) => (release = r))) });
    const older = entry("older");

    act(() => history.record(older));
    act(() => history.record(slow));

    let held;
    act(() => {
      held = history.undoLast();
      history.undoLast();
    });
    expect(older.undo).not.toHaveBeenCalled();

    await act(async () => {
      release();
      await held;
    });
    expect(slow.undo).toHaveBeenCalledTimes(1);
  });

  it("keeps a write that could not be undone, and says so", async () => {
    const showMessage = vi.fn();
    render(<Probe showMessage={showMessage} />);
    const failing = entry("Undo delete (2)", {
      destructive: true,
      undo: vi.fn().mockRejectedValue(new Error("store offline")),
    });

    act(() => history.record(failing));
    let result;
    await act(async () => {
      result = await history.undoLast();
    });

    expect(result).toBe(false);
    expect(showMessage).toHaveBeenCalledWith(expect.stringMatching(/failed/i), "error");

    // Still there to try again once the store is back.
    await act(async () => {
      failing.undo.mockResolvedValue(undefined);
      await history.undoLast();
    });
    expect(failing.undo).toHaveBeenCalledTimes(2);
  });
});
