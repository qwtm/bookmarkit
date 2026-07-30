import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useBookmarkStore } from "./useBookmarkStore.js";

const getStore = vi.fn();
vi.mock("../stores/index.js", () => ({
  getStore: (...args) => getStore(...args),
  STORE_TYPES: { LOCAL: "local", FIREBASE: "firebase" },
}));

const fakeStore = (overrides) => ({
  init: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn().mockReturnValue(() => {}),
  ...overrides,
});

// init() is a mount effect, so the hook is driven through a component.
const observe = (showMessage = () => {}) => {
  const seen = { current: null };
  const Probe = () => {
    const store = useBookmarkStore();
    seen.current = store;
    useEffect(() => store.init(showMessage), []);
    return null;
  };
  render(<Probe />);
  return seen;
};

beforeEach(() => {
  getStore.mockReset();
});

describe("useBookmarkStore opening the collection (#18)", () => {
  it("publishes the store once it has been read", async () => {
    const store = fakeStore({
      list: vi.fn().mockResolvedValue([{ id: "1", url: "https://a.test/" }]),
    });
    getStore.mockResolvedValue(store);

    const seen = observe();

    await waitFor(() => expect(seen.current.isLoading).toBe(false));
    expect(seen.current.bookmarks).toHaveLength(1);
    expect(seen.current.loadError).toBeNull();
    expect(seen.current.storeRef.current).toBe(store);
  });

  // The hazard #18 is about: an empty list plus a writable store is
  // indistinguishable from a real empty collection, and Add or Import from that
  // screen would write against bookmarks we never managed to read.
  it("withholds the store when the first read fails", async () => {
    const showMessage = vi.fn();
    getStore.mockResolvedValue(
      fakeStore({ list: vi.fn().mockRejectedValue(new Error("Insufficient permissions")) })
    );

    const seen = observe(showMessage);

    await waitFor(() => expect(seen.current.isLoading).toBe(false));
    expect(seen.current.loadError).toBe("Insufficient permissions");
    expect(seen.current.storeRef.current).toBeNull();
    expect(showMessage).toHaveBeenCalledWith(expect.stringContaining("Could not open"), "error");
  });

  it("withholds the store when init fails", async () => {
    getStore.mockResolvedValue(
      fakeStore({ init: vi.fn().mockRejectedValue(new Error("Firebase sign-in failed")) })
    );

    const seen = observe();

    await waitFor(() => expect(seen.current.loadError).toBe("Firebase sign-in failed"));
    expect(seen.current.isLoading).toBe(false);
    expect(seen.current.storeRef.current).toBeNull();
  });

  it("refuses to write through a store that was never opened", async () => {
    const showMessage = vi.fn();
    const store = fakeStore({
      list: vi.fn().mockRejectedValue(new Error("nope")),
      create: vi.fn(),
      bulkAdd: vi.fn(),
    });
    getStore.mockResolvedValue(store);

    const seen = observe();
    await waitFor(() => expect(seen.current.loadError).toBe("nope"));

    await seen.current.saveBookmark({ url: "https://new.test/" }, showMessage);
    await seen.current.appendBookmarks([{ url: "https://new.test/" }], showMessage);

    expect(showMessage).toHaveBeenCalledWith(expect.stringContaining("not initialized"), "error");
    expect(store.create).not.toHaveBeenCalled();
    expect(store.bulkAdd).not.toHaveBeenCalled();
  });

  it("reports a lost subscription without emptying the list", async () => {
    let report;
    getStore.mockImplementation(async (_type, { onError }) => {
      report = onError;
      return fakeStore({
        list: vi.fn().mockResolvedValue([{ id: "1", url: "https://a.test/" }]),
      });
    });
    const showMessage = vi.fn();

    const seen = observe(showMessage);
    await waitFor(() => expect(seen.current.isLoading).toBe(false));

    report(new Error("Connection lost"));

    expect(showMessage).toHaveBeenCalledWith(expect.stringContaining("last loaded copy"), "error");
    expect(seen.current.bookmarks).toHaveLength(1);
  });
});
