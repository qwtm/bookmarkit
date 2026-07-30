import { describe, it, expect } from "vitest";

import {
  chunkForOrganize,
  cleanFolderPath,
  existingFolders,
  organizePatches,
  organizeRow,
  organizeRows,
  parseOrganizeProposals,
} from "./organizePlan.js";

const bookmark = (over = {}) => ({
  id: "a",
  title: "Rust ownership",
  url: "https://example.com/rust",
  description: "",
  tags: [],
  folderId: "",
  ...over,
});

describe("chunkForOrganize", () => {
  it("slices the collection into request-sized pieces", () => {
    const list = Array.from({ length: 7 }, (_, i) => bookmark({ id: String(i) }));

    expect(chunkForOrganize(list, 3).map((chunk) => chunk.length)).toEqual([3, 3, 1]);
  });

  it("never loops forever on a nonsense size", () => {
    expect(chunkForOrganize([bookmark()], 0)).toHaveLength(1);
  });
});

describe("existingFolders", () => {
  it("lists the folders in use, once each, sorted", () => {
    const list = [
      bookmark({ id: "1", folderId: "Work/Rust" }),
      bookmark({ id: "2", folderId: "Reading" }),
      bookmark({ id: "3", folderId: "Work/Rust" }),
      bookmark({ id: "4" }),
    ];

    expect(existingFolders(list)).toEqual(["Reading", "Work/Rust"]);
  });
});

describe("cleanFolderPath", () => {
  it("keeps a plausible path and drops the noise around it", () => {
    expect(cleanFolderPath(" Work / Rust ")).toBe("Work/Rust");
    expect(cleanFolderPath("//a//b//")).toBe("a/b");
  });

  it("refuses to go deeper than three segments", () => {
    expect(cleanFolderPath("a/b/c/d/e")).toBe("a/b/c");
  });

  // The point of tidying is fewer folders, not a "Work" beside a "work".
  it("adopts an existing folder that differs only in case", () => {
    expect(cleanFolderPath("work/rust", ["Work/Rust"])).toBe("Work/Rust");
  });

  it("has nothing to say about a value that is not a path", () => {
    expect(cleanFolderPath("")).toBe("");
    expect(cleanFolderPath(null)).toBe("");
    expect(cleanFolderPath("///")).toBe("");
  });
});

describe("parseOrganizeProposals", () => {
  const chunk = [bookmark({ id: "a" }), bookmark({ id: "b" })];

  it("reads a fenced answer for the bookmarks it asked about", () => {
    const answer = `Here you go:
\`\`\`json
[{"id": "a", "tags": ["rust", "memory"], "folderId": "Programming/Rust",
  "description": "How ownership works."}]
\`\`\``;

    expect(parseOrganizeProposals(answer, chunk).get("a")).toEqual({
      tags: ["rust", "memory"],
      folderId: "Programming/Rust",
      description: "How ownership works.",
    });
  });

  // An id it made up must not become a write against some other bookmark.
  it("drops an entry for a bookmark that was not in the slice", () => {
    const answer = '[{"id": "zzz", "tags": ["anything"]}]';

    expect(parseOrganizeProposals(answer, chunk).size).toBe(0);
  });

  it("keeps the first answer for a bookmark and ignores a second", () => {
    const answer = '[{"id": "a", "tags": ["first"]}, {"id": "a", "tags": ["second"]}]';

    expect(parseOrganizeProposals(answer, chunk).get("a").tags).toEqual(["first"]);
  });

  it("caps and de-duplicates what it accepts", () => {
    const answer = JSON.stringify([
      {
        id: "a",
        tags: ["one", "One", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
        description: "x".repeat(500),
      },
    ]);

    const proposal = parseOrganizeProposals(answer, chunk).get("a");
    expect(proposal.tags).toHaveLength(8);
    expect(proposal.tags.filter((tag) => tag.toLowerCase() === "one")).toHaveLength(1);
    expect(proposal.description).toHaveLength(300);
  });

  it("accepts `folder` as well as `folderId`", () => {
    const answer = '[{"id": "a", "folder": "Reading"}]';

    expect(parseOrganizeProposals(answer, chunk).get("a")).toEqual({ folderId: "Reading" });
  });

  it("has nothing to say about an answer that is not a list of proposals", () => {
    expect(parseOrganizeProposals("I cannot help with that.", chunk).size).toBe(0);
    expect(parseOrganizeProposals("[not json", chunk).size).toBe(0);
    expect(parseOrganizeProposals(null, chunk).size).toBe(0);
    expect(parseOrganizeProposals('[{"id": "a"}]', chunk).size).toBe(0);
  });
});

describe("organizeRow", () => {
  it("adds tags rather than replacing them", () => {
    const row = organizeRow(bookmark({ tags: ["rust"] }), { tags: ["memory", "Rust"] });

    expect(row.after.tags).toEqual(["rust", "memory"]);
    expect(row.before.tags).toEqual(["rust"]);
  });

  it("leaves a description the user wrote alone", () => {
    const row = organizeRow(bookmark({ description: "My own words" }), {
      description: "A model's words",
    });

    expect(row).toBeNull();
  });

  it("fills a description that is missing", () => {
    const row = organizeRow(bookmark(), { description: "How ownership works." });

    expect(row.fields).toEqual(["description"]);
    expect(row.after).toEqual({ description: "How ownership works." });
  });

  it("is nothing at all when the proposal changes nothing", () => {
    expect(
      organizeRow(bookmark({ tags: ["rust"], folderId: "Work" }), {
        tags: ["rust"],
        folderId: "Work",
      })
    ).toBeNull();
  });

  it("never proposes a title or a URL, whatever it was handed", () => {
    const row = organizeRow(bookmark(), { title: "Something else", url: "https://evil.test" });

    expect(row).toBeNull();
  });
});

describe("organizeRows", () => {
  it("keeps only the fields that were asked about", () => {
    const proposals = new Map([["a", { tags: ["rust"], folderId: "Work" }]]);

    const rows = organizeRows([bookmark({ id: "a" })], proposals, { fields: ["folderId"] });
    expect(rows[0].fields).toEqual(["folderId"]);
  });

  it("skips the bookmarks with nothing to change", () => {
    const proposals = new Map([["a", { folderId: "Work" }]]);

    const rows = organizeRows(
      [bookmark({ id: "a", folderId: "Work" }), bookmark({ id: "b" })],
      proposals
    );
    expect(rows).toEqual([]);
  });
});

describe("organizePatches", () => {
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
    expect(organizePatches(rows, ["b"])).toEqual([{ id: "b", folderId: "W" }]);
  });

  it("writes nothing when everything was rejected", () => {
    expect(organizePatches(rows, [])).toEqual([]);
  });
});
