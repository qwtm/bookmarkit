import { describe, expect, it } from "vitest";

import { acceptedPatches, changeRow } from "./changeReview.js";

describe("changeRow", () => {
  it("keeps the fields that would change, in the order given", () => {
    const row = changeRow(
      { id: "a", title: "A" },
      {
        tags: { before: [], after: ["rust"] },
        folderId: { before: "", after: "Work" },
      }
    );

    expect(row).toEqual({
      id: "a",
      title: "A",
      fields: ["tags", "folderId"],
      before: { tags: [], folderId: "" },
      after: { tags: ["rust"], folderId: "Work" },
    });
  });

  it("skips a field that would change nothing", () => {
    const row = changeRow({ id: "a", title: "A" }, { tags: null, folderId: undefined });
    expect(row).toBeNull();
  });

  it("falls back to the URL when there is no title to show", () => {
    const row = changeRow({ id: "a", url: "https://a.test" }, { rating: { before: 0, after: 5 } });
    expect(row.title).toBe("https://a.test");
  });

  it("refuses a bookmark with no id, which nothing could be written back to", () => {
    expect(changeRow({ title: "A" }, { rating: { before: 0, after: 5 } })).toBeNull();
  });
});

describe("acceptedPatches", () => {
  const rows = [
    { id: "a", title: "A", fields: ["tags"], before: { tags: [] }, after: { tags: ["rust"] } },
    {
      id: "b",
      title: "B",
      fields: ["folderId"],
      before: { folderId: "" },
      after: { folderId: "W" },
    },
  ];

  it("writes only what the user kept", () => {
    expect(acceptedPatches(rows, ["b"])).toEqual([{ id: "b", folderId: "W" }]);
  });

  it("writes nothing when everything was rejected", () => {
    expect(acceptedPatches(rows, [])).toEqual([]);
  });

  it("takes the kept ids as a set as readily as a list", () => {
    expect(acceptedPatches(rows, new Set(["a"]))).toEqual([{ id: "a", tags: ["rust"] }]);
  });
});
