import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installFakeChromeBookmarks } from "../test/fakeChromeBookmarks.js";
import { createChromeBookmarksStore } from "./chromeBookmarksStore.js";

const manyBookmarks = (count) =>
  Array.from({ length: count }, (_, i) => ({
    title: `Bookmark ${i}`,
    url: `https://example.com/${i}`,
  }));

describe("teardown (#19)", () => {
  let fake;

  beforeEach(() => {
    fake = installFakeChromeBookmarks();
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  it("removes the chrome.bookmarks listeners registered by init", async () => {
    const store = createChromeBookmarksStore();
    await store.init();
    expect(fake.listenerCount).toBe(4);

    store.teardown();

    expect(fake.listenerCount).toBe(0);
  });

  it("stops notifying subscribers after teardown", async () => {
    const store = createChromeBookmarksStore();
    await store.init();
    const seen = [];
    store.subscribe((all) => seen.push(all));

    store.teardown();
    await store.create({ title: "After teardown", url: "https://example.com/" });

    expect(seen).toEqual([]);
  });

  // The debounce that makes a burst cost one tree walk also means a walk can be
  // scheduled and not yet run. Teardown has to cancel it, or an unloading page
  // reaches for chrome.bookmarks after it is gone.
  it("cancels a notify that was already scheduled", async () => {
    vi.useFakeTimers();
    try {
      const store = createChromeBookmarksStore();
      await store.init();
      fake.bookmarks.onCreated.dispatch("x", {});
      const readTree = vi.spyOn(globalThis.chrome.bookmarks, "getTree");

      store.teardown();
      await vi.advanceTimersByTimeAsync(100);

      expect(readTree).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not accumulate listeners when a store is re-initialized", async () => {
    const first = createChromeBookmarksStore();
    await first.init();
    first.teardown();

    const second = createChromeBookmarksStore();
    await second.init();

    expect(fake.listenerCount).toBe(4);
    second.teardown();
  });
});

describe("chromeBookmarksStore notification batching (#14)", () => {
  let fake;
  let store;
  let emissions;

  beforeEach(async () => {
    vi.useFakeTimers();
    fake = installFakeChromeBookmarks();
    store = createChromeBookmarksStore();
    await store.init();
    emissions = [];
    store.subscribe((all) => emissions.push(all.length));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  // Chrome fires one event per touched node and every event used to trigger a
  // full recursive tree walk, so importing N bookmarks cost N walks.
  it("emits once for a bulk add, not once per bookmark", async () => {
    await store.bulkAdd(manyBookmarks(50));
    await vi.advanceTimersByTimeAsync(100);
    expect(emissions).toEqual([50]);
  });

  it("emits once for a bulk replace that removes and recreates everything", async () => {
    await store.bulkAdd(manyBookmarks(20));
    emissions.length = 0;
    await store.bulkReplace(manyBookmarks(30));
    await vi.advanceTimersByTimeAsync(100);
    expect(emissions).toEqual([30]);
  });

  it("emits once for a multi-delete", async () => {
    const created = await store.bulkAdd(manyBookmarks(10));
    emissions.length = 0;
    await store.removeMany(created.slice(0, 6).map((b) => b.id));
    await vi.advanceTimersByTimeAsync(100);
    expect(emissions).toEqual([4]);
  });

  it("emits once for a reorder, which moves every node in turn", async () => {
    const created = await store.bulkAdd(manyBookmarks(15));
    emissions.length = 0;
    await store.reorderBookmarks([...created].reverse().map((b) => b.id));
    await vi.advanceTimersByTimeAsync(100);
    expect(emissions).toEqual([15]);
  });

  it("emits once when a sort persists through a nested reorder", async () => {
    await store.bulkAdd(manyBookmarks(12));
    emissions.length = 0;
    await store.persistSortedOrder({ sortBy: "title", order: "desc" });
    await vi.advanceTimersByTimeAsync(100);
    expect(emissions).toEqual([12]);
  });

  it("still reports changes made outside the store, coalesced into one emission", async () => {
    // A burst from the bookmark manager or another extension: many events, one walk.
    for (let i = 0; i < 5; i++) fake.bookmarks.onCreated.dispatch("x", {});
    expect(emissions).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(emissions).toEqual([0]);
  });

  it("still reports the tree after a write that throws part way", async () => {
    const created = await store.bulkAdd(manyBookmarks(3));
    emissions.length = 0;
    await expect(store.remove("no-such-id")).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(100);
    expect(emissions).toEqual([created.length]);
  });
});

describe("chromeBookmarksStore bulk writes", () => {
  let fake;
  let store;

  beforeEach(async () => {
    fake = installFakeChromeBookmarks();
    store = createChromeBookmarksStore();
    await store.init();
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  // #42: an HTML import derives folders from its <H3> tags, and the Chrome tree
  // is what chrome://bookmarks and every synced device show.
  it("creates bulk-added bookmarks inside the folders they name", async () => {
    await store.bulkAdd([
      { title: "Flat", url: "https://flat.example", folderId: "" },
      { title: "Docs", url: "https://docs.example", folderId: "Work" },
      { title: "Spec", url: "https://spec.example", folderId: "Work/Project A" },
    ]);
    expect(fake.urlPaths().sort()).toEqual([
      "bookmarkit/Flat",
      "bookmarkit/Work/Docs",
      "bookmarkit/Work/Project A/Spec",
    ]);
  });

  it("reuses one folder for bookmarks that share a path", async () => {
    await store.bulkAdd([
      { title: "A", url: "https://a.example", folderId: "Work/Project" },
      { title: "B", url: "https://b.example", folderId: "Work/Project" },
      { title: "C", url: "https://c.example", folderId: "Work" },
    ]);
    expect(fake.urlPaths().sort()).toEqual([
      "bookmarkit/Work/C",
      "bookmarkit/Work/Project/A",
      "bookmarkit/Work/Project/B",
    ]);
  });

  it("reports the folder each added bookmark landed in", async () => {
    const added = await store.bulkAdd([
      { title: "Spec", url: "https://spec.example", folderId: "Work/Project A" },
    ]);
    expect(added[0].folderId).toBe("Work/Project A");
  });

  it("honors folders on replace too, and clears the previous nested bookmarks", async () => {
    await store.bulkAdd([{ title: "Old", url: "https://old.example", folderId: "Archive" }]);
    await store.bulkReplace([{ title: "New", url: "https://new.example", folderId: "Fresh" }]);
    expect(fake.urlPaths()).toEqual(["bookmarkit/Fresh/New"]);
  });

  // #43: reorder read only the root's children, so ids nested in a subfolder
  // were filtered out and never moved — a foldered collection stayed unsorted
  // while the UI implied the whole thing had been persisted.
  it("sorts bookmarks inside subfolders, not just at the root", async () => {
    await store.bulkAdd([
      { title: "Charlie", url: "https://c.example", folderId: "Work" },
      { title: "Alpha", url: "https://a.example", folderId: "Work" },
      { title: "Bravo", url: "https://b.example", folderId: "Work" },
    ]);
    await store.persistSortedOrder({ sortBy: "title", order: "asc" });
    expect(fake.urlPaths()).toEqual([
      "bookmarkit/Work/Alpha",
      "bookmarkit/Work/Bravo",
      "bookmarkit/Work/Charlie",
    ]);
  });

  it("sorts each folder independently, leaving subfolders where they are", async () => {
    await store.bulkAdd([
      { title: "Nested", url: "https://n.example", folderId: "Work" },
      { title: "Zulu", url: "https://z.example", folderId: "" },
      { title: "Mike", url: "https://m.example", folderId: "" },
    ]);
    await store.persistSortedOrder({ sortBy: "title", order: "asc" });
    // The Work folder still comes first among the root's children.
    expect(fake.urlPaths()).toEqual([
      "bookmarkit/Work/Nested",
      "bookmarkit/Mike",
      "bookmarkit/Zulu",
    ]);
  });

  it("puts bookmarks it was not told about after the ones it was", async () => {
    const added = await store.bulkAdd([
      { title: "First", url: "https://1.example", folderId: "" },
      { title: "Second", url: "https://2.example", folderId: "" },
      { title: "Third", url: "https://3.example", folderId: "" },
    ]);
    await store.reorderBookmarks([added[2].id]);
    expect(fake.urlPaths()).toEqual(["bookmarkit/Third", "bookmarkit/First", "bookmarkit/Second"]);
  });

  // #17: replace used to delete everything first, so a failure part way through
  // creation left the collection gone with nothing to restore it from.
  it("keeps the existing collection when a replacement cannot be written", async () => {
    const original = [
      { title: "Keep 1", url: "https://keep1.example", folderId: "" },
      { title: "Keep 2", url: "https://keep2.example", folderId: "Nested" },
    ];
    await store.bulkAdd(original);
    const before = fake.urlPaths().sort();

    const create = fake.bookmarks.create;
    fake.bookmarks.create = (node) =>
      node.url === "https://bad.example"
        ? Promise.reject(new Error("quota exceeded"))
        : create(node);

    await expect(
      store.bulkReplace([
        { title: "Good", url: "https://good.example", folderId: "" },
        { title: "Bad", url: "https://bad.example", folderId: "" },
      ])
    ).rejects.toThrow(/nothing was replaced/);

    // The originals survive and the half-written replacement leaves no trace.
    expect(fake.urlPaths().sort()).toEqual(before);
  });
});

// #17: a folder here only exists to hold bookmarks, so one left empty by a write
// is a shell — and chrome://bookmarks and every synced device show it.
describe("chromeBookmarksStore folder cleanup", () => {
  let fake;
  let store;

  const failCreatesFor = (url) => {
    const create = fake.bookmarks.create;
    fake.bookmarks.create = (node) =>
      node.url === url ? Promise.reject(new Error("quota exceeded")) : create(node);
  };

  beforeEach(async () => {
    fake = installFakeChromeBookmarks();
    store = createChromeBookmarksStore();
    await store.init();
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  it("takes the old folders with the bookmarks they held", async () => {
    await store.bulkAdd([{ title: "Old", url: "https://old.example", folderId: "Archive/2019" }]);
    await store.bulkReplace([{ title: "New", url: "https://new.example", folderId: "Fresh" }]);
    expect(fake.folderPaths()).toEqual(["bookmarkit", "bookmarkit/Fresh"]);
  });

  it("keeps a folder the replacement still uses", async () => {
    await store.bulkAdd([{ title: "Old", url: "https://old.example", folderId: "Work" }]);
    await store.bulkReplace([{ title: "New", url: "https://new.example", folderId: "Work" }]);
    expect(fake.folderPaths()).toEqual(["bookmarkit", "bookmarkit/Work"]);
    expect(fake.urlPaths()).toEqual(["bookmarkit/Work/New"]);
  });

  it("removes the folders a failed replacement opened", async () => {
    await store.bulkAdd([{ title: "Keep", url: "https://keep.example", folderId: "Work" }]);
    failCreatesFor("https://bad.example");

    await expect(
      store.bulkReplace([
        { title: "Good", url: "https://good.example", folderId: "Incoming/Batch" },
        { title: "Bad", url: "https://bad.example", folderId: "Incoming/Batch" },
      ])
    ).rejects.toThrow(/nothing was replaced/);

    expect(fake.folderPaths()).toEqual(["bookmarkit", "bookmarkit/Work"]);
    expect(fake.urlPaths()).toEqual(["bookmarkit/Work/Keep"]);
  });

  // Rolling back must not tidy up beyond what the failed write did. An empty
  // folder that was already there is the user's, waiting to be filled.
  it("leaves an empty folder the user made themselves", async () => {
    const root = (await chrome.bookmarks.getChildren("1")).find((n) => n.title === "bookmarkit");
    await chrome.bookmarks.create({ parentId: root.id, title: "Someday" });
    failCreatesFor("https://bad.example");

    await expect(
      store.bulkReplace([{ title: "Bad", url: "https://bad.example", folderId: "Someday" }])
    ).rejects.toThrow(/nothing was replaced/);

    expect(fake.folderPaths()).toEqual(["bookmarkit", "bookmarkit/Someday"]);
  });

  it("removes a folder opened for an addition that never landed", async () => {
    failCreatesFor("https://bad.example");

    await expect(
      store.bulkAdd([
        { title: "Good", url: "https://good.example", folderId: "Landed" },
        { title: "Bad", url: "https://bad.example", folderId: "Missing/Deep" },
      ])
    ).rejects.toThrow(/quota/);

    expect(fake.folderPaths()).toEqual(["bookmarkit", "bookmarkit/Landed"]);
    expect(fake.urlPaths()).toEqual(["bookmarkit/Landed/Good"]);
  });
});
