import { describe, expect, it } from "vitest";

import { findNeverOpened, isNeverOpened, openedAt, openedPatch } from "./openHistory.js";

const at = (iso) => ({ id: iso, createdAt: iso });

describe("openHistory", () => {
  it("treats an absent record as never opened, because nothing said otherwise", () => {
    expect(isNeverOpened({})).toBe(true);
    expect(isNeverOpened({ lastOpenedAt: "" })).toBe(true);
    expect(isNeverOpened({ lastOpenedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("reads a garbled timestamp as never rather than as NaN", () => {
    expect(openedAt({ lastOpenedAt: "whenever" })).toBe(0);
    expect(openedAt({ lastOpenedAt: "2026-01-01T00:00:00.000Z" })).toBe(1767225600000);
  });

  it("lists the unopened oldest first, which is the order worth triaging", () => {
    const list = [
      { ...at("2026-03-01T00:00:00.000Z") },
      { ...at("2026-01-01T00:00:00.000Z") },
      { ...at("2026-02-01T00:00:00.000Z"), lastOpenedAt: "2026-02-02T00:00:00.000Z" },
    ];
    expect(findNeverOpened(list).map((b) => b.id)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ]);
  });

  it("records only the open, so opening a bookmark is not an edit of it", () => {
    expect(openedPatch(1767225600000)).toEqual({ lastOpenedAt: "2026-01-01T00:00:00.000Z" });
  });
});
