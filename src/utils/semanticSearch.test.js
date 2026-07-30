import { describe, it, expect } from "vitest";

import {
  contentHash,
  cosine,
  embeddingText,
  mergeSemanticMatches,
  rankBySimilarity,
  readIndex,
  staleBookmarks,
  updateIndex,
} from "./semanticSearch.js";

const bookmark = (over = {}) => ({
  id: "1",
  title: "Pinecone and friends",
  description: "Storing embeddings for retrieval",
  tags: ["ai"],
  url: "https://example.com/p/8812",
  folderId: "Work/Search",
  ...over,
});

describe("embeddingText", () => {
  it("says what the bookmark says, without the URL", () => {
    const text = embeddingText(bookmark());

    expect(text).toContain("Pinecone and friends");
    expect(text).toContain("Storing embeddings");
    expect(text).toContain("ai");
    expect(text).toContain("Work Search");
    expect(text).not.toContain("8812");
  });

  it("is empty for a bookmark with nothing to say", () => {
    expect(embeddingText({ id: "1", url: "https://example.com" })).toBe("");
    expect(embeddingText(null)).toBe("");
  });
});

describe("contentHash", () => {
  it("is the same for the same text and different for different text", () => {
    expect(contentHash("a b c")).toBe(contentHash("a b c"));
    expect(contentHash("a b c")).not.toBe(contentHash("a b d"));
  });

  it("has an answer for nothing at all", () => {
    expect(typeof contentHash(undefined)).toBe("string");
  });
});

describe("cosine", () => {
  it("is 1 for the same direction and 0 for a right angle", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("refuses to compare what cannot be compared", () => {
    expect(cosine([1, 0], [1, 0, 0])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine(null, [1])).toBe(0);
  });
});

describe("readIndex", () => {
  it("reads a stored index back", () => {
    const stored = JSON.stringify({ 1: { hash: "abc", source: "openai|m|", vector: [0.1, 0.2] } });

    expect(readIndex(stored)).toEqual({
      1: { hash: "abc", source: "openai|m|", vector: [0.1, 0.2] },
    });
  });

  it("gives a vector with no recorded origin a source nothing matches", () => {
    const stored = JSON.stringify({ 1: { hash: "abc", vector: [0.1] } });

    expect(readIndex(stored)[1].source).toBe("");
  });

  // Storage is hand-editable and outlives versions, so anything odd is dropped
  // rather than trusted into a comparison.
  it("drops entries that are not a hash and a vector of numbers", () => {
    const stored = JSON.stringify({
      good: { hash: "h", vector: [1] },
      noHash: { vector: [1] },
      noVector: { hash: "h" },
      emptyVector: { hash: "h", vector: [] },
      strings: { hash: "h", vector: ["1", "2"] },
      infinite: { hash: "h", vector: [Number.POSITIVE_INFINITY] },
    });

    expect(Object.keys(readIndex(stored))).toEqual(["good"]);
  });

  it("has nothing to say about unreadable storage", () => {
    expect(readIndex("{not json")).toEqual({});
    expect(readIndex(undefined)).toEqual({});
    expect(readIndex("[1,2]")).toEqual({});
  });
});

describe("staleBookmarks", () => {
  it("is the bookmarks whose text has no matching vector", () => {
    const one = bookmark({ id: "1" });
    const two = bookmark({ id: "2", title: "Sourdough" });
    const index = { 1: { hash: contentHash(embeddingText(one)), vector: [1] } };

    expect(staleBookmarks([one, two], index).map((b) => b.id)).toEqual(["2"]);
  });

  it("is the edited ones too, since their text changed", () => {
    const before = bookmark({ id: "1" });
    const index = { 1: { hash: contentHash(embeddingText(before)), vector: [1] } };
    const after = { ...before, title: "Pinecone, revisited" };

    expect(staleBookmarks([after], index)).toHaveLength(1);
  });

  it("skips a bookmark with no text worth embedding", () => {
    expect(staleBookmarks([{ id: "1", url: "https://example.com" }], {})).toEqual([]);
  });
});

describe("updateIndex", () => {
  it("adds vectors and forgets deleted bookmarks", () => {
    const index = { gone: { hash: "h", vector: [1] } };

    const next = updateIndex(index, [{ id: "1", hash: "h1", vector: [0.5] }], new Set(["1"]));
    expect(Object.keys(next)).toEqual(["1"]);
  });

  it("ignores an entry with no vector to store", () => {
    expect(updateIndex({}, [{ id: "1", hash: "h", vector: [] }])).toEqual({});
  });
});

describe("rankBySimilarity", () => {
  const list = [bookmark({ id: "near" }), bookmark({ id: "far" }), bookmark({ id: "unindexed" })];
  const index = {
    near: { hash: "h", vector: [1, 0] },
    far: { hash: "h", vector: [0, 1] },
  };

  it("answers with the close ones, closest first", () => {
    const ranked = rankBySimilarity([1, 0.1], list, index, { minSimilarity: 0.5 });

    expect(ranked).toEqual(["near"]);
  });

  it("says nothing about a bookmark with no vector", () => {
    const ranked = rankBySimilarity([1, 1], list, index, { minSimilarity: 0 });

    expect(ranked).not.toContain("unindexed");
  });

  it("stops at the limit", () => {
    const ranked = rankBySimilarity([1, 1], list, index, { minSimilarity: 0, limit: 1 });

    expect(ranked).toHaveLength(1);
  });
});

describe("mergeSemanticMatches", () => {
  const all = [bookmark({ id: "1" }), bookmark({ id: "2" }), bookmark({ id: "3" })];

  it("keeps the substring matches first, in their own order", () => {
    const merged = mergeSemanticMatches([all[1]], all, ["3", "1"]);

    expect(merged.map((b) => b.id)).toEqual(["2", "3", "1"]);
  });

  it("does not list a bookmark twice", () => {
    const merged = mergeSemanticMatches([all[0]], all, ["1", "2"]);

    expect(merged.map((b) => b.id)).toEqual(["1", "2"]);
  });

  it("is the substring result alone when there is no ranking", () => {
    expect(mergeSemanticMatches([all[0]], all, [])).toEqual([all[0]]);
  });

  it("ignores a ranked id that is no longer in the list", () => {
    expect(mergeSemanticMatches([], all, ["gone"])).toEqual([]);
  });
});

// A model's vectors only mean anything against vectors from the same model, so the
// index has to know which one it holds.
describe("vectors remember where they came from (#46)", () => {
  const bookmarks = [{ id: "1", title: "Pinecone basics", tags: [] }];
  const hash = contentHash(embeddingText(bookmarks[0]));

  it("re-embeds everything when the provider or model changed", () => {
    const index = { 1: { hash, source: "openai|text-embedding-3-small|", vector: [1, 0] } };

    expect(staleBookmarks(bookmarks, index, "gemini|text-embedding-004|")).toHaveLength(1);
    expect(staleBookmarks(bookmarks, index, "openai|text-embedding-3-small|")).toHaveLength(0);
  });

  it("keeps the source it was embedded with", () => {
    const next = updateIndex({}, [{ id: "1", hash, source: "ollama|nomic|", vector: [1, 0] }]);

    expect(next[1].source).toBe("ollama|nomic|");
  });

  it("ignores vectors from another space when ranking", () => {
    const index = {
      1: { hash, source: "old|model|", vector: [1, 0] },
      2: { hash, source: "new|model|", vector: [1, 0] },
    };
    const list = [bookmarks[0], { id: "2", title: "Vector databases", tags: [] }];

    expect(rankBySimilarity([1, 0], list, index, { source: "new|model|" })).toEqual(["2"]);
  });
});
