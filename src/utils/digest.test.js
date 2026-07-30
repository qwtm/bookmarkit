import { describe, expect, it } from "vitest";

import {
  WEEK_MS,
  digestSets,
  fallbackThemes,
  hasDigest,
  parseDigestThemes,
  themeItems,
  withRemainder,
} from "./digest.js";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;

const bookmark = (id, props = {}) => ({ id, title: id, createdAt: ago(30 * DAY), ...props });

describe("digestSets", () => {
  it("reports what arrived inside the window, newest first", () => {
    const sets = digestSets(
      [
        bookmark("old"),
        bookmark("yesterday", { createdAt: ago(DAY) }),
        bookmark("today", { createdAt: ago(60 * 1000) }),
      ],
      NOW
    );
    expect(sets.added.map((b) => b.id)).toEqual(["today", "yesterday"]);
  });

  it("does not ask about the week's own arrivals", () => {
    // Saved yesterday, unopened and untagged — which is not neglect, it is new.
    const sets = digestSets([bookmark("fresh", { createdAt: ago(DAY) })], NOW);
    expect(sets.neverOpened).toEqual([]);
    expect(sets.untagged).toEqual([]);
  });

  it("names what settled in and was never opened, oldest first", () => {
    const sets = digestSets(
      [
        bookmark("older", { createdAt: ago(60 * DAY) }),
        bookmark("newer", { createdAt: ago(20 * DAY) }),
        bookmark("read", { createdAt: ago(40 * DAY), lastOpenedAt: ago(DAY) }),
      ],
      NOW
    );
    expect(sets.neverOpened.map((b) => b.id)).toEqual(["older", "newer"]);
  });

  it("counts an empty tag list as untagged and a tagged one as filed", () => {
    const sets = digestSets(
      [bookmark("bare", { tags: [] }), bookmark("filed", { tags: ["rust"] })],
      NOW
    );
    expect(sets.untagged.map((b) => b.id)).toEqual(["bare"]);
  });

  it("caps each section so a digest stays readable", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      bookmark(`b${i}`, { createdAt: ago(60 * DAY) })
    );
    const sets = digestSets(many, NOW, { limit: 3 });
    expect(sets.neverOpened).toHaveLength(3);
  });

  it("takes the window it is given", () => {
    const sets = digestSets([bookmark("b", { createdAt: ago(10 * DAY) })], NOW, {
      windowMs: 20 * DAY,
    });
    expect(sets.added.map((b) => b.id)).toEqual(["b"]);
    expect(WEEK_MS).toBe(7 * DAY);
  });

  it("has nothing to say about an empty collection", () => {
    expect(hasDigest(digestSets([], NOW))).toBe(false);
    expect(hasDigest(null)).toBe(false);
    expect(hasDigest(digestSets([bookmark("b", { createdAt: ago(DAY) })], NOW))).toBe(true);
  });
});

describe("parseDigestThemes", () => {
  const shown = [bookmark("a"), bookmark("b"), bookmark("c")];

  it("reads themes out of a fenced answer", () => {
    const text = '```json\n[{"theme":"Rust","summary":"Ownership.","ids":["a","b"]}]\n```';
    expect(parseDigestThemes(text, shown)).toEqual([
      { title: "Rust", summary: "Ownership.", ids: ["a", "b"] },
    ]);
  });

  it("drops ids it was never shown, and the theme left with none", () => {
    const text = '[{"theme":"Invented","ids":["nope"]},{"theme":"Real","ids":["c","nope"]}]';
    expect(parseDigestThemes(text, shown)).toEqual([{ title: "Real", summary: "", ids: ["c"] }]);
  });

  it("gives a bookmark to the first theme that claims it", () => {
    const text = '[{"theme":"First","ids":["a"]},{"theme":"Second","ids":["a","b"]}]';
    expect(parseDigestThemes(text, shown).map((t) => t.ids)).toEqual([["a"], ["b"]]);
  });

  it("treats an unreadable answer as no themes", () => {
    expect(parseDigestThemes("I could not group these.", shown)).toEqual([]);
    expect(parseDigestThemes(undefined, shown)).toEqual([]);
  });
});

describe("fallbackThemes", () => {
  it("groups by folder, then by tag, largest group first", () => {
    const themes = fallbackThemes([
      bookmark("a", { folderId: "Work" }),
      bookmark("b", { folderId: "Work" }),
      bookmark("c", { tags: ["rust"] }),
      bookmark("d"),
    ]);
    expect(themes).toEqual([
      { title: "Work", summary: "", ids: ["a", "b"] },
      { title: "Everything else", summary: "", ids: ["d"] },
      { title: "rust", summary: "", ids: ["c"] },
    ]);
  });
});

describe("withRemainder", () => {
  it("sweeps up what no theme claimed", () => {
    const added = [bookmark("a"), bookmark("b"), bookmark("c")];
    const themes = [{ title: "Work", summary: "", ids: ["a"] }];

    expect(withRemainder(themes, added)).toEqual([
      { title: "Work", summary: "", ids: ["a"] },
      { title: "Also saved", summary: "", ids: ["b", "c"] },
    ]);
  });

  it("adds nothing when every addition is already named", () => {
    const added = [bookmark("a"), bookmark("b")];
    const themes = [{ title: "Work", summary: "", ids: ["a", "b"] }];

    expect(withRemainder(themes, added)).toEqual(themes);
  });

  it("covers the additions a capped grouping had to drop", () => {
    const added = Array.from({ length: 12 }, (_, i) => bookmark(`b${i}`, { folderId: `F${i}` }));

    const themes = withRemainder(fallbackThemes(added), added);

    expect(themes.flatMap((theme) => theme.ids).sort()).toEqual(added.map((b) => b.id).sort());
  });
});

describe("themeItems", () => {
  it("resolves a theme to bookmarks in the order it named them", () => {
    const shown = [bookmark("a"), bookmark("b")];
    expect(themeItems({ ids: ["b", "a", "gone"] }, shown).map((b) => b.id)).toEqual(["b", "a"]);
  });
});
