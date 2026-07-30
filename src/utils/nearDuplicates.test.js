import { describe, it, expect } from "vitest";

import {
  candidateReason,
  findNearDuplicateCandidates,
  parseDuplicateVerdicts,
  proposeDuplicateRemovals,
} from "./nearDuplicates.js";

const bookmark = (id, title, url, extra = {}) => ({ id, title, url, ...extra });

describe("candidateReason", () => {
  it("asks about the same article under two URLs", () => {
    const canonical = bookmark("1", "Rust ownership explained", "https://blog.example.com/rust");
    const syndicated = bookmark("2", "Rust ownership, explained", "https://dev.other.com/p/9182");

    expect(candidateReason(canonical, syndicated)).toBe("similar titles");
  });

  it("asks about two pages on one site", () => {
    const a = bookmark("1", "Pricing", "https://example.com/pricing");
    const b = bookmark("2", "Docs", "https://example.com/docs");

    expect(candidateReason(a, b)).toBe("same site");
  });

  it("leaves alone what the deterministic rule already catches", () => {
    const a = bookmark("1", "Rust", "https://example.com/rust?utm_source=news");
    const b = bookmark("2", "Rust, again", "http://www.example.com/rust/");

    expect(candidateReason(a, b)).toBeNull();
  });

  it("has nothing to ask about unrelated bookmarks", () => {
    const a = bookmark("1", "Sourdough starter", "https://bread.example/starter");
    const b = bookmark("2", "Kubernetes operators", "https://k8s.example/operators");

    expect(candidateReason(a, b)).toBeNull();
  });

  it("does not read a title match out of shared filler words", () => {
    const a = bookmark("1", "How to and the for your", "https://one.example/a");
    const b = bookmark("2", "How to and the for your", "https://two.example/b");

    expect(candidateReason(a, b)).toBeNull();
  });

  it("skips a bookmark with no URL to compare", () => {
    expect(candidateReason(bookmark("1", "Note", ""), bookmark("2", "Note", ""))).toBeNull();
  });
});

describe("findNearDuplicateCandidates", () => {
  it("puts the stronger signal first", () => {
    const list = [
      bookmark("1", "Pricing", "https://example.com/pricing"),
      bookmark("2", "Docs", "https://example.com/docs"),
      bookmark("3", "Rust ownership explained", "https://a.example/rust"),
      bookmark("4", "Rust ownership, explained", "https://b.example/rust"),
    ];

    expect(findNearDuplicateCandidates(list)[0].reason).toBe("similar titles");
  });

  it("caps how much is asked about", () => {
    const list = Array.from({ length: 20 }, (_, i) =>
      bookmark(`${i}`, `Page ${i}`, `https://example.com/${i}`)
    );

    expect(findNearDuplicateCandidates(list, { limit: 5 })).toHaveLength(5);
  });

  it("has nothing to ask about an empty or single-bookmark view", () => {
    expect(findNearDuplicateCandidates([])).toEqual([]);
    expect(findNearDuplicateCandidates([bookmark("1", "One", "https://a.example")])).toEqual([]);
  });
});

describe("parseDuplicateVerdicts", () => {
  const pairs = [
    { a: {}, b: {} },
    { a: {}, b: {} },
  ];

  it("reads a fenced answer", () => {
    const text = '```json\n[{"pair": 0, "same": true, "reason": "same article"}]\n```';

    expect(parseDuplicateVerdicts(text, pairs)).toEqual([
      { pair: 0, same: true, reason: "same article" },
    ]);
  });

  it("drops a verdict about a pair nobody asked about", () => {
    const text = '[{"pair": 7, "same": true, "reason": "invented"}]';

    expect(parseDuplicateVerdicts(text, pairs)).toEqual([]);
  });

  it("drops a verdict that is not a verdict", () => {
    const text = '[{"pair": 0, "same": "yes"}, {"pair": 1, "same": false, "reason": "different"}]';

    expect(parseDuplicateVerdicts(text, pairs)).toEqual([
      { pair: 1, same: false, reason: "different" },
    ]);
  });

  it("keeps the first answer for a pair answered twice", () => {
    const text = '[{"pair": 0, "same": true, "reason": "first"}, {"pair": 0, "same": false}]';

    expect(parseDuplicateVerdicts(text, pairs)).toEqual([{ pair: 0, same: true, reason: "first" }]);
  });

  it("shortens a reason that runs on", () => {
    const text = `[{"pair": 0, "same": true, "reason": "${"why ".repeat(100)}"}]`;

    expect(parseDuplicateVerdicts(text, pairs)[0].reason.length).toBeLessThanOrEqual(140);
  });

  it("returns nothing for an answer it cannot read", () => {
    expect(parseDuplicateVerdicts("Sorry, I cannot help with that.", pairs)).toEqual([]);
    expect(parseDuplicateVerdicts("", pairs)).toEqual([]);
    expect(parseDuplicateVerdicts('{"pair": 0}', pairs)).toEqual([]);
  });
});

describe("proposeDuplicateRemovals", () => {
  const bare = bookmark("bare", "Rust ownership", "https://a.example/rust");
  const annotated = bookmark("rich", "Rust ownership, explained", "https://b.example/rust", {
    tags: ["rust"],
    rating: 4,
    description: "Notes from a second read.",
  });

  it("keeps the copy carrying the work", () => {
    const pairs = [{ a: bare, b: annotated, reason: "similar titles" }];
    const { ids, reasons } = proposeDuplicateRemovals(pairs, [
      { pair: 0, same: true, reason: "syndicated copy" },
    ]);

    expect(ids).toEqual(["bare"]);
    expect(reasons[0]).toMatchObject({
      id: "bare",
      keptTitle: "Rust ownership, explained",
      reason: "syndicated copy",
    });
  });

  it("proposes nothing for a pair the model called different", () => {
    const pairs = [{ a: bare, b: annotated, reason: "similar titles" }];

    expect(proposeDuplicateRemovals(pairs, [{ pair: 0, same: false, reason: "" }]).ids).toEqual([]);
  });

  // Three copies pair up three ways. Acting on every "same" verdict would delete
  // all of them; a bookmark already spoken for is left out of later pairs.
  it("never empties a group of copies", () => {
    const one = bookmark("1", "Same page", "https://a.example/x");
    const two = bookmark("2", "Same page", "https://b.example/x");
    const three = bookmark("3", "Same page", "https://c.example/x");
    const pairs = [
      { a: one, b: two, reason: "similar titles" },
      { a: two, b: three, reason: "similar titles" },
      { a: one, b: three, reason: "similar titles" },
    ];

    const { ids } = proposeDuplicateRemovals(pairs, [
      { pair: 0, same: true, reason: "same" },
      { pair: 1, same: true, reason: "same" },
      { pair: 2, same: true, reason: "same" },
    ]);

    expect(ids).toEqual(["2"]);
  });

  it("falls back to the candidate's own reason when the model gave none", () => {
    const pairs = [{ a: bare, b: annotated, reason: "similar titles" }];
    const { reasons } = proposeDuplicateRemovals(pairs, [{ pair: 0, same: true, reason: "" }]);

    expect(reasons[0].reason).toBe("similar titles");
  });
});
