import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { useBookmarkStore } from "./useBookmarkStore.js";

// A store that remembers what it was told, so a test can ask what the undo of a
// write actually did rather than what it claimed it would do.
let store;

const fakeStore = (initial) => {
  let bookmarks = [...initial];
  let notify = () => {};
  let nextId = 100;
  return {
    calls: [],
    init: vi.fn(),
    list: async () => bookmarks,
    subscribe: (cb) => {
      notify = cb;
      return () => {};
    },
    current: () => bookmarks,
    create: vi.fn(async (bookmark) => {
      const created = { ...bookmark, id: bookmark.id || String(nextId++) };
      bookmarks = [...bookmarks, created];
      notify(bookmarks);
      return created;
    }),
    update: vi.fn(async (id, patch) => {
      bookmarks = bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b));
      notify(bookmarks);
    }),
    updateMany: vi.fn(async (patches) => {
      for (const { id, ...patch } of patches) {
        bookmarks = bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b));
      }
      notify(bookmarks);
    }),
    remove: vi.fn(async (id) => {
      bookmarks = bookmarks.filter((b) => b.id !== id);
      notify(bookmarks);
    }),
    removeMany: vi.fn(async (ids) => {
      bookmarks = bookmarks.filter((b) => !ids.includes(b.id));
      notify(bookmarks);
    }),
    bulkAdd: vi.fn(async (arr) => {
      const added = arr.map((b) => ({ ...b, id: b.id || String(nextId++) }));
      bookmarks = [...bookmarks, ...added];
      notify(bookmarks);
      return added;
    }),
    bulkReplace: vi.fn(async (arr) => {
      bookmarks = arr.map((b) => ({ ...b, id: b.id || String(nextId++) }));
      notify(bookmarks);
    }),
    reorderBookmarks: vi.fn(async (orderedIds) => {
      bookmarks = orderedIds.map((id) => bookmarks.find((b) => b.id === id)).filter(Boolean);
      notify(bookmarks);
    }),
    persistSortedOrder: vi.fn(async ({ sortBy }) => {
      bookmarks = [...bookmarks].sort((a, b) => String(a[sortBy]).localeCompare(String(b[sortBy])));
      notify(bookmarks);
    }),
  };
};

vi.mock("../stores/index.js", () => ({
  STORE_TYPES: { CHROME: "chrome", FIREBASE: "firebase", LOCAL: "local" },
  getStore: async () => store,
}));

let hook;
let recorded;

const Probe = () => {
  hook = useBookmarkStore(recorded.push.bind(recorded));
  React.useEffect(() => hook.init(() => {}), []);
  return <span data-testid="count">{hook.bookmarks.length}</span>;
};

const mount = async (initial = []) => {
  store = fakeStore(initial);
  render(<Probe />);
  await waitFor(() => expect(hook.isLoading).toBe(false));
};

const undoLast = async () => {
  await act(async () => {
    await recorded.at(-1).undo();
  });
};

const ids = () => store.current().map((b) => b.id);

beforeEach(() => {
  hook = undefined;
  recorded = [];
});

describe("useBookmarkStore undo recording (#56)", () => {
  it("puts an edited bookmark back", async () => {
    await mount([{ id: "1", title: "Original", tags: ["keep"], rating: 4 }]);

    await act(async () => {
      await hook.saveBookmark({ id: "1", title: "Changed", tags: [], rating: 1 }, () => {});
    });
    expect(store.current()[0].title).toBe("Changed");

    await undoLast();

    expect(store.current()[0]).toMatchObject({ title: "Original", tags: ["keep"], rating: 4 });
  });

  it("removes a bookmark that was just created", async () => {
    await mount([]);

    await act(async () => {
      await hook.saveBookmark({ title: "New", url: "https://new.example" }, () => {});
    });
    expect(store.current()).toHaveLength(1);

    await undoLast();

    expect(store.current()).toHaveLength(0);
  });

  it("brings deleted bookmarks back with their metadata", async () => {
    await mount([
      { id: "1", title: "One", tags: ["x"], rating: 5, description: "kept" },
      { id: "2", title: "Two" },
    ]);

    await act(async () => {
      await hook.deleteBookmarks(["1"]);
    });
    expect(ids()).toEqual(["2"]);

    await undoLast();

    expect(store.current().find((b) => b.title === "One")).toMatchObject({
      tags: ["x"],
      rating: 5,
      description: "kept",
    });
  });

  it("restores the whole collection a replacement wiped", async () => {
    await mount([
      { id: "1", title: "One" },
      { id: "2", title: "Two" },
    ]);

    await act(async () => {
      await hook.saveAllBookmarks([{ id: "9", title: "Only" }]);
    });
    expect(store.current()).toHaveLength(1);

    await undoLast();

    expect(store.current().map((b) => b.title)).toEqual(["One", "Two"]);
    expect(recorded.at(-1).destructive).toBe(true);
  });

  it("takes back an import without touching what was there before", async () => {
    await mount([{ id: "1", title: "Mine" }]);

    await act(async () => {
      await hook.appendBookmarks([{ title: "Imported A" }, { title: "Imported B" }], () => {});
    });
    expect(store.current()).toHaveLength(3);

    await undoLast();

    expect(store.current().map((b) => b.title)).toEqual(["Mine"]);
  });

  it("restores the order a sort replaced", async () => {
    await mount([
      { id: "1", title: "Charlie" },
      { id: "2", title: "Alpha" },
      { id: "3", title: "Bravo" },
    ]);

    await act(async () => {
      await hook.persistSortedOrder({ sortBy: "title", order: "asc" });
    });
    expect(ids()).toEqual(["2", "3", "1"]);

    await undoLast();

    expect(ids()).toEqual(["1", "2", "3"]);
  });

  // Otherwise the undo of an undo would be a redo, and Cmd+Z twice would land
  // back where it started.
  it("does not record the writes an undo makes", async () => {
    await mount([{ id: "1", title: "Original" }]);

    await act(async () => {
      await hook.saveBookmark({ id: "1", title: "Changed" }, () => {});
    });
    await undoLast();

    expect(recorded).toHaveLength(1);
  });

  it("takes a bulk edit back in one step, field by field", async () => {
    await mount([
      { id: "1", title: "One", tags: ["react"], rating: 3 },
      { id: "2", title: "Two", tags: [], rating: 0 },
    ]);

    await act(async () => {
      await hook.applyBulkEdit([
        { id: "1", tags: ["react", "reading"] },
        { id: "2", tags: ["reading"] },
      ]);
    });
    expect(store.current().map((b) => b.tags)).toEqual([["react", "reading"], ["reading"]]);

    // One entry for the batch, not one per bookmark.
    expect(recorded).toHaveLength(1);
    await undoLast();

    expect(store.current().map((b) => b.tags)).toEqual([["react"], []]);
    // The rating was not part of the edit, so undoing it did not touch it.
    expect(store.current().map((b) => b.rating)).toEqual([3, 0]);
  });

  it("asks the store to write a bulk edit in one round-trip when it can", async () => {
    await mount([
      { id: "1", tags: [] },
      { id: "2", tags: [] },
    ]);

    await act(async () => {
      await hook.applyBulkEdit([
        { id: "1", tags: ["a"] },
        { id: "2", tags: ["a"] },
      ]);
    });

    expect(store.updateMany).toHaveBeenCalledTimes(1);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("walks a store that cannot, rather than refusing the edit", async () => {
    store = fakeStore([
      { id: "1", tags: [] },
      { id: "2", tags: [] },
    ]);
    delete store.updateMany;
    render(<Probe />);
    await waitFor(() => expect(hook.isLoading).toBe(false));

    await act(async () => {
      await hook.applyBulkEdit([
        { id: "1", tags: ["a"] },
        { id: "2", tags: ["a"] },
      ]);
    });

    expect(store.update).toHaveBeenCalledTimes(2);
    expect(store.current().map((b) => b.tags)).toEqual([["a"], ["a"]]);
  });

  it("records nothing for a bulk edit with no patches", async () => {
    await mount([{ id: "1", tags: [] }]);

    await act(async () => {
      await hook.applyBulkEdit([]);
    });

    expect(recorded).toHaveLength(0);
    expect(store.updateMany).not.toHaveBeenCalled();
  });

  it("records nothing for a surface that offers no undo", async () => {
    store = fakeStore([{ id: "1", title: "One" }]);
    const Popup = () => {
      hook = useBookmarkStore();
      React.useEffect(() => hook.init(() => {}), []);
      return null;
    };
    render(<Popup />);
    await waitFor(() => expect(hook.isLoading).toBe(false));

    await act(async () => {
      await hook.saveBookmark({ title: "Added from the popup" }, () => {});
    });

    expect(recorded).toHaveLength(0);
    expect(store.current()).toHaveLength(2);
  });
});
