import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFakeChromeBookmarks } from "../test/fakeChromeBookmarks.js";
import { createChromeBookmarksStore } from "./chromeBookmarksStore.js";

let fake;

beforeEach(() => {
  fake = installFakeChromeBookmarks();
});

afterEach(() => {
  delete globalThis.chrome;
});

describe("teardown (#19)", () => {
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
