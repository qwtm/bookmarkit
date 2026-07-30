import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  TAG_STATE,
  applyManualFilters,
  cycleTag,
  deriveTagCounts,
  getTagState,
  hasActiveFilters,
} from "./manualFilters.js";

const list = [
  {
    id: "1",
    title: "React docs",
    url: "http://react.dev",
    description: "",
    tags: ["react", "docs"],
    rating: 5,
  },
  {
    id: "2",
    title: "Vue docs",
    url: "http://vuejs.org",
    description: "",
    tags: ["vue", "docs"],
    rating: 3,
  },
  {
    id: "3",
    title: "Random blog",
    url: "http://blog.com",
    description: "about react",
    tags: [],
    rating: 0,
  },
];

describe("deriveTagCounts", () => {
  it("counts tags case-insensitively, most frequent first", () => {
    expect(deriveTagCounts(list)).toEqual([
      { tag: "docs", count: 2 },
      { tag: "react", count: 1 },
      { tag: "vue", count: 1 },
    ]);
  });

  it("counts a tag once per bookmark even when repeated in different cases", () => {
    expect(deriveTagCounts([{ id: "1", tags: ["react", "React", "REACT"] }])).toEqual([
      { tag: "react", count: 1 },
    ]);
  });

  it("tolerates missing/blank tags", () => {
    expect(deriveTagCounts([{ id: "1" }, { id: "2", tags: ["", "  "] }])).toEqual([]);
    expect(deriveTagCounts()).toEqual([]);
  });

  it("breaks count ties alphabetically so chip order is stable", () => {
    const tied = [{ id: "1", tags: ["zebra", "alpha"] }];
    expect(deriveTagCounts(tied).map((t) => t.tag)).toEqual(["alpha", "zebra"]);
  });
});

describe("cycleTag / getTagState", () => {
  it("cycles off → include → exclude → off", () => {
    let f = EMPTY_FILTERS;
    expect(getTagState(f, "react")).toBe(TAG_STATE.OFF);

    f = cycleTag(f, "react");
    expect(getTagState(f, "react")).toBe(TAG_STATE.INCLUDE);
    expect(f.includeTags).toEqual(["react"]);

    f = cycleTag(f, "react");
    expect(getTagState(f, "react")).toBe(TAG_STATE.EXCLUDE);
    expect(f.includeTags).toEqual([]);
    expect(f.excludeTags).toEqual(["react"]);

    f = cycleTag(f, "react");
    expect(getTagState(f, "react")).toBe(TAG_STATE.OFF);
    expect(f.excludeTags).toEqual([]);
  });

  it("does not mutate the input filters", () => {
    const f = { ...EMPTY_FILTERS };
    cycleTag(f, "react");
    expect(f.includeTags).toEqual([]);
  });

  it("tracks multiple tags independently", () => {
    const f = cycleTag(cycleTag(EMPTY_FILTERS, "react"), "docs");
    expect(f.includeTags).toEqual(["react", "docs"]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for empty/whitespace-only filters", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, text: "   " })).toBe(false);
    expect(hasActiveFilters(null)).toBe(false);
  });

  it("is true when any single filter is set", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, text: "a" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, includeTags: ["x"] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, excludeTags: ["x"] })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, minRating: 1 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sortBy: "title" })).toBe(true);
  });
});

describe("applyManualFilters", () => {
  it("returns the list unchanged when nothing is set", () => {
    expect(applyManualFilters(EMPTY_FILTERS, list)).toEqual(list);
    expect(applyManualFilters(null, list)).toBe(list);
  });

  it("filters by text across title, url, description and tags", () => {
    const ids = applyManualFilters({ ...EMPTY_FILTERS, text: "react" }, list).map((b) => b.id);
    expect(ids).toEqual(["1", "3"]); // #3 matches on description
  });

  it("includes and excludes tags", () => {
    expect(
      applyManualFilters({ ...EMPTY_FILTERS, includeTags: ["docs"] }, list).map((b) => b.id)
    ).toEqual(["1", "2"]);
    expect(
      applyManualFilters(
        { ...EMPTY_FILTERS, includeTags: ["docs"], excludeTags: ["vue"] },
        list
      ).map((b) => b.id)
    ).toEqual(["1"]);
  });

  it("filters by minimum rating inclusively", () => {
    expect(applyManualFilters({ ...EMPTY_FILTERS, minRating: 3 }, list).map((b) => b.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("sorts by field and direction", () => {
    expect(
      applyManualFilters({ ...EMPTY_FILTERS, sortBy: "title", order: "asc" }, list).map(
        (b) => b.title
      )
    ).toEqual(["Random blog", "React docs", "Vue docs"]);
    expect(
      applyManualFilters({ ...EMPTY_FILTERS, sortBy: "rating", order: "desc" }, list).map(
        (b) => b.id
      )
    ).toEqual(["1", "2", "3"]);
  });

  it("composes text + tags + rating + sort together", () => {
    const out = applyManualFilters(
      {
        ...EMPTY_FILTERS,
        text: "docs",
        includeTags: ["docs"],
        minRating: 3,
        sortBy: "rating",
        order: "asc",
      },
      list
    );
    expect(out.map((b) => b.id)).toEqual(["2", "1"]);
  });

  it("does not mutate the input list", () => {
    const snapshot = [...list];
    applyManualFilters({ ...EMPTY_FILTERS, sortBy: "title" }, list);
    expect(list).toEqual(snapshot);
  });
});

// Codex review on #58: deriveTagCounts trimmed tags but findWithTags did not, so a chip built
// from an untrimmed tag filtered away the very bookmark that produced its count. Tags reach the
// store unnormalized (JSON import passes `tags` straight through), so this is reachable.
describe("chip counts agree with chip filtering (regression, #58)", () => {
  const untrimmed = [
    { id: "1", title: "Docs", url: "http://a.com", tags: [" docs "] },
    { id: "2", title: "Other", url: "http://b.com", tags: ["\tDocs\n"] },
    { id: "3", title: "Unrelated", url: "http://c.com", tags: ["news"] },
  ];

  it("counts whitespace/case variants of a tag as one facet", () => {
    expect(deriveTagCounts(untrimmed)).toEqual([
      { tag: "docs", count: 2 },
      { tag: "news", count: 1 },
    ]);
  });

  it("clicking a chip returns exactly the bookmarks it counted", () => {
    const facet = deriveTagCounts(untrimmed).find((f) => f.tag === "docs");
    const shown = applyManualFilters({ ...EMPTY_FILTERS, includeTags: ["docs"] }, untrimmed);
    expect(shown.map((b) => b.id)).toEqual(["1", "2"]);
    expect(shown).toHaveLength(facet.count);
  });

  it("excluding a chip removes exactly those bookmarks", () => {
    const shown = applyManualFilters({ ...EMPTY_FILTERS, excludeTags: ["docs"] }, untrimmed);
    expect(shown.map((b) => b.id)).toEqual(["3"]);
  });
});

describe("brokenOnly (#47)", () => {
  const withStatus = [
    { id: "1", title: "Alive", url: "http://a.com", urlStatus: "valid" },
    { id: "2", title: "Dead", url: "http://b.com", urlStatus: "invalid" },
    { id: "3", title: "Left alone", url: "http://c.com", urlStatus: "ignored" },
  ];

  it("keeps only the links the last check could not reach", () => {
    const filtered = applyManualFilters({ ...EMPTY_FILTERS, brokenOnly: true }, withStatus);

    expect(filtered.map((b) => b.id)).toEqual(["2"]);
  });

  it("changes nothing while it is off", () => {
    expect(applyManualFilters(EMPTY_FILTERS, withStatus)).toHaveLength(3);
  });

  it("counts as an active filter, so Clear filters reaches it", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, brokenOnly: true })).toBe(true);
  });
});

// #55: clicking a folder in the tree is a manual filter, so it combines with the
// others and a saved view can hold it.
describe("filtering by folder (#55)", () => {
  const filed = [
    { id: "1", title: "One", url: "https://one.test", tags: [], folderId: "Work" },
    { id: "2", title: "Two", url: "https://two.test", tags: [], folderId: "Work/Project A" },
    { id: "3", title: "Three", url: "https://three.test", tags: [], folderId: "Personal" },
    { id: "4", title: "Four", url: "https://four.test", tags: [] },
  ];

  it("narrows to a folder and everything under it", () => {
    const result = applyManualFilters({ ...EMPTY_FILTERS, folder: "Work" }, filed);

    expect(result.map((b) => b.id)).toEqual(["1", "2"]);
  });

  it("is not an active filter until a folder is chosen", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, folder: "" })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, folder: "Work" })).toBe(true);
  });

  it("layers on the other filters rather than replacing them", () => {
    const result = applyManualFilters({ ...EMPTY_FILTERS, folder: "Work", text: "two" }, filed);

    expect(result.map((b) => b.id)).toEqual(["2"]);
  });
});
