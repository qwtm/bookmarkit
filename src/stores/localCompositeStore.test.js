import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installFakeChromeBookmarks } from "../test/fakeChromeBookmarks.js";
import { createLocalCompositeStore, orphanMetaKeys } from "./localCompositeStore.js";

describe("orphanMetaKeys (#16)", () => {
  it("returns bm_meta keys whose bookmark id is no longer valid", () => {
    const keys = ["bm_meta:1", "bm_meta:2", "bm_meta:3"];
    const valid = new Set(["2"]);
    expect(orphanMetaKeys(keys, valid)).toEqual(["bm_meta:1", "bm_meta:3"]);
  });

  it("ignores non-metadata keys", () => {
    const keys = ["bm_current_theme", "bm_themes", "bm_meta:1"];
    expect(orphanMetaKeys(keys, new Set())).toEqual(["bm_meta:1"]);
  });

  it("returns [] when every id is still valid", () => {
    const keys = ["bm_meta:1", "bm_meta:2"];
    expect(orphanMetaKeys(keys, new Set(["1", "2"]))).toEqual([]);
  });

  it("tolerates null/empty keys", () => {
    expect(orphanMetaKeys([null, undefined, ""], new Set())).toEqual([]);
    expect(orphanMetaKeys(null, new Set())).toEqual([]);
  });
});

describe("teardown (#19)", () => {
  let fake;

  beforeEach(() => {
    fake = installFakeChromeBookmarks();
    localStorage.clear();
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  it("releases the underlying chrome listeners and the pending debounced notify", async () => {
    const store = createLocalCompositeStore();
    await store.init();
    const seen = [];
    store.subscribe((all) => seen.push(all));

    store.teardown();
    // Longer than the 50ms notify debounce that init() scheduled.
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(seen).toEqual([]);
    expect(fake.listenerCount).toBe(0);
  });
});
