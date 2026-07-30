import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findSnapshot = vi.fn();

vi.mock("../utils/archiveRecovery.js", async () => {
  const actual = await vi.importActual("../utils/archiveRecovery.js");
  return { ...actual, findSnapshot };
});

const { useArchiveRecovery } = await import("./useArchiveRecovery.js");

const dead = (id) => ({ id, title: id, url: `https://${id}.test`, urlStatus: "invalid" });
const snapshotFor = (id) => ({ url: `https://web.archive.org/web/2020/${id}`, timestamp: "" });

const noPacing = { gapMs: 0 };

describe("useArchiveRecovery", () => {
  beforeEach(() => {
    findSnapshot.mockReset();
  });

  it("proposes a change per dead link an archived copy was found for", async () => {
    findSnapshot.mockImplementation((url) =>
      Promise.resolve(url.includes("a") ? snapshotFor("a") : null)
    );
    const { result } = renderHook(() => useArchiveRecovery({ pacing: noPacing }));

    let rows;
    await act(async () => {
      rows = await result.current.run([dead("a"), dead("b")]);
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].after.url).toBe("https://web.archive.org/web/2020/a");
    expect(result.current.running).toBe(false);
  });

  it("asks about nothing that is not a dead link", async () => {
    const showMessage = vi.fn();
    const { result } = renderHook(() => useArchiveRecovery({ showMessage, pacing: noPacing }));

    let rows;
    await act(async () => {
      rows = await result.current.run([{ id: "x", url: "https://fine.test", urlStatus: "valid" }]);
    });

    expect(rows).toEqual([]);
    expect(findSnapshot).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith(expect.stringContaining("No dead links"), "info");
  });

  it("caps a run, so a collection of thousands cannot start a scrape", async () => {
    findSnapshot.mockResolvedValue(null);
    const { result } = renderHook(() => useArchiveRecovery({ pacing: { gapMs: 0, limit: 2 } }));

    await act(async () => {
      await result.current.run([dead("a"), dead("b"), dead("c"), dead("d")]);
    });

    expect(findSnapshot).toHaveBeenCalledTimes(2);
  });

  it("says so when the archive has nothing, instead of failing", async () => {
    findSnapshot.mockResolvedValue(null);
    const showMessage = vi.fn();
    const { result } = renderHook(() => useArchiveRecovery({ showMessage, pacing: noPacing }));

    await act(async () => {
      await result.current.run([dead("a")]);
    });

    expect(showMessage).toHaveBeenCalledWith("No archived copies found.", "info");
  });

  it("keeps what it already found when a lookup throws", async () => {
    findSnapshot
      .mockResolvedValueOnce(snapshotFor("a"))
      .mockRejectedValueOnce(new Error("network"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const showMessage = vi.fn();
    const { result } = renderHook(() => useArchiveRecovery({ showMessage, pacing: noPacing }));

    let rows;
    await act(async () => {
      rows = await result.current.run([dead("a"), dead("b")]);
    });

    expect(rows).toHaveLength(1);
    expect(showMessage).toHaveBeenCalledWith(expect.stringContaining("stopped early"), "error");
    error.mockRestore();
  });

  it("refuses to run twice at once", async () => {
    findSnapshot.mockResolvedValue(null);
    const { result } = renderHook(() => useArchiveRecovery({ pacing: noPacing }));

    await act(async () => {
      const [first, second] = await Promise.all([
        result.current.run([dead("a")]),
        result.current.run([dead("b")]),
      ]);
      expect(second).toEqual([]);
      expect(first).toEqual([]);
    });

    expect(findSnapshot).toHaveBeenCalledTimes(1);
  });
});
