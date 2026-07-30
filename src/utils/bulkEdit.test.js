import { describe, it, expect } from "vitest";
import { planBulkEdit, previousValuesFor, describeBulkEdit, isEmptyChange } from "./bulkEdit.js";

const selection = [
  { id: "1", title: "One", tags: ["react"], folderId: "work", rating: 3 },
  { id: "2", title: "Two", tags: [], folderId: "", rating: 0 },
];

describe("planBulkEdit (#54)", () => {
  it("adds tags without dropping the ones a bookmark already has", () => {
    const { patches } = planBulkEdit(selection, { addTags: "reading" });

    expect(patches).toEqual([
      { id: "1", tags: ["react", "reading"] },
      { id: "2", tags: ["reading"] },
    ]);
  });

  it("leaves out a bookmark the change would not alter", () => {
    const { patches, unchanged } = planBulkEdit(selection, { addTags: "react" });

    // The first is already tagged react; only the second needs a write.
    expect(patches).toEqual([{ id: "2", tags: ["react"] }]);
    expect(unchanged).toBe(1);
  });

  it("treats a tag that differs only in case as already there", () => {
    const { patches } = planBulkEdit([{ id: "1", tags: ["React"] }], { addTags: "react" });

    expect(patches).toEqual([]);
  });

  it("removes a tag whatever case it was stored in", () => {
    const { patches } = planBulkEdit([{ id: "1", tags: ["React", "keep"] }], {
      removeTags: "react",
    });

    expect(patches).toEqual([{ id: "1", tags: ["keep"] }]);
  });

  it("adds and removes in one pass", () => {
    const { patches } = planBulkEdit([{ id: "1", tags: ["old", "keep"] }], {
      addTags: "new",
      removeTags: "old",
    });

    expect(patches).toEqual([{ id: "1", tags: ["keep", "new"] }]);
  });

  it("keeps a comma-separated list of tags apart, and its duplicates together", () => {
    const { patches } = planBulkEdit([{ id: "1", tags: [] }], {
      addTags: " one , two ,, one ",
    });

    expect(patches).toEqual([{ id: "1", tags: ["one", "two"] }]);
  });

  it("moves a selection into a folder, skipping those already in it", () => {
    const { patches } = planBulkEdit(selection, { folderId: "work" });

    expect(patches).toEqual([{ id: "2", folderId: "work" }]);
  });

  it("moves a selection out of its folders", () => {
    const { patches } = planBulkEdit(selection, { folderId: "" });

    expect(patches).toEqual([{ id: "1", folderId: "" }]);
  });

  it("sets and clears ratings", () => {
    expect(planBulkEdit(selection, { rating: 5 }).patches).toEqual([
      { id: "1", rating: 5 },
      { id: "2", rating: 5 },
    ]);
    expect(planBulkEdit(selection, { rating: 0 }).patches).toEqual([{ id: "1", rating: 0 }]);
  });

  it("carries every requested field in one patch per bookmark", () => {
    const { patches } = planBulkEdit([selection[1]], {
      addTags: "keep",
      folderId: "work",
      rating: 4,
    });

    expect(patches).toEqual([{ id: "2", tags: ["keep"], folderId: "work", rating: 4 }]);
  });

  it("writes nothing for an empty change", () => {
    expect(planBulkEdit(selection, {}).patches).toEqual([]);
    expect(isEmptyChange({})).toBe(true);
    expect(isEmptyChange({ addTags: " , " })).toBe(true);
    expect(isEmptyChange({ rating: 0 })).toBe(false);
    expect(isEmptyChange({ folderId: "" })).toBe(false);
  });
});

describe("previousValuesFor (#54)", () => {
  it("reads back only the fields the change touched", () => {
    const { patches } = planBulkEdit(selection, { addTags: "reading", rating: 5 });

    expect(previousValuesFor(patches, selection)).toEqual([
      { id: "1", tags: ["react"], rating: 3 },
      { id: "2", tags: [], rating: 0 },
    ]);
  });

  it("skips a bookmark that is no longer there", () => {
    const previous = previousValuesFor([{ id: "gone", rating: 5 }], selection);

    expect(previous).toEqual([]);
  });

  it("fills in a missing field with what an empty one looks like", () => {
    const previous = previousValuesFor(
      [{ id: "1", tags: [], folderId: "x", rating: 1 }],
      [{ id: "1" }]
    );

    expect(previous).toEqual([{ id: "1", tags: "", folderId: "", rating: 0 }]);
  });
});

describe("describeBulkEdit (#54)", () => {
  it("says what is about to happen, and to how many", () => {
    expect(describeBulkEdit({ addTags: "a, b", rating: 4 }, 12)).toBe(
      "add a, b, rate 4 — 12 bookmarks"
    );
    expect(describeBulkEdit({ removeTags: "old" }, 1)).toBe("remove old — 1 bookmark");
    expect(describeBulkEdit({ folderId: "" }, 3)).toBe("move to no folder — 3 bookmarks");
    expect(describeBulkEdit({ rating: 0 }, 3)).toBe("clear rating — 3 bookmarks");
  });

  it("says nothing about an empty change", () => {
    expect(describeBulkEdit({}, 5)).toBe("");
  });
});
