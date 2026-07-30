import { describe, expect, it } from "vitest";

import {
  BROKEN,
  countDue,
  findBrokenLinks,
  isBroken,
  isCheckable,
  nextSweepBatch,
  readCheckedAt,
  recordChecked,
  sweepPatch,
} from "./linkHealth.js";

const bookmark = (id, extra = {}) => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  urlStatus: "valid",
  ...extra,
});

const DAY = 24 * 60 * 60 * 1000;

describe("findBrokenLinks", () => {
  it("keeps the ones the last check could not reach", () => {
    const list = [
      bookmark("a"),
      bookmark("b", { urlStatus: BROKEN }),
      bookmark("c", { unreachable: true }),
      bookmark("d", { urlStatus: "ignored" }),
    ];

    expect(findBrokenLinks(list).map((b) => b.id)).toEqual(["b", "c"]);
  });

  it("does not call an ignored link broken", () => {
    expect(isBroken(bookmark("a", { urlStatus: "ignored" }))).toBe(false);
  });
});

describe("isCheckable", () => {
  it("refuses what a click would refuse, and what the user opted out", () => {
    expect(isCheckable(bookmark("a"))).toBe(true);
    expect(isCheckable(bookmark("b", { url: "javascript:alert(1)" }))).toBe(false);
    expect(isCheckable(bookmark("c", { url: "chrome://extensions" }))).toBe(false);
    expect(isCheckable(bookmark("d", { urlStatus: "ignored" }))).toBe(false);
    expect(isCheckable({ id: "e" })).toBe(false);
  });
});

describe("nextSweepBatch", () => {
  const now = 40 * DAY;

  it("takes the never-checked first, then the longest ago", () => {
    const list = [bookmark("recent"), bookmark("old"), bookmark("never")];
    const checkedAt = { recent: now - 8 * DAY, old: now - 30 * DAY };

    const batch = nextSweepBatch(list, checkedAt, { now, size: 3, recheckAfterMs: 7 * DAY });

    expect(batch.map((b) => b.id)).toEqual(["never", "old", "recent"]);
  });

  it("leaves alone what was checked recently enough", () => {
    const list = [bookmark("a"), bookmark("b")];
    const checkedAt = { a: now - 1 * DAY, b: now - 20 * DAY };

    expect(nextSweepBatch(list, checkedAt, { now, recheckAfterMs: 7 * DAY })).toHaveLength(1);
  });

  it("hands back one batch at a time, so a big collection is swept in passes", () => {
    const list = Array.from({ length: 12 }, (_, i) => bookmark(`b${i}`));

    expect(nextSweepBatch(list, {}, { now, size: 5 })).toHaveLength(5);
    expect(countDue(list, {}, { now })).toBe(12);
  });

  it("skips the links it would never fetch", () => {
    const list = [
      bookmark("ok"),
      bookmark("ignored", { urlStatus: "ignored" }),
      bookmark("internal", { url: "http://127.0.0.1:8080/admin" }),
    ];

    expect(nextSweepBatch(list, {}, { now }).map((b) => b.id)).toEqual(["ok"]);
  });
});

describe("sweepPatch", () => {
  it("writes only when the status changed", () => {
    expect(sweepPatch(bookmark("a"), { status: "valid" })).toBeNull();
    expect(sweepPatch(bookmark("a"), { status: "invalid" })).toEqual({
      id: "a",
      urlStatus: BROKEN,
    });
    expect(sweepPatch(bookmark("a", { urlStatus: BROKEN }), { status: "valid" })).toEqual({
      id: "a",
      urlStatus: "valid",
    });
  });

  // #10: a redirect target from a privileged fetch is not something to trust,
  // and the worker does not disclose one. A sweep must not re-point a bookmark.
  it("never rewrites the URL, even when a redirect is reported", () => {
    const patch = sweepPatch(bookmark("a", { urlStatus: BROKEN }), {
      status: "valid",
      redirectUrl: "http://169.254.169.254/latest/meta-data",
    });

    expect(patch).toEqual({ id: "a", urlStatus: "valid" });
  });

  it("treats anything that is not a clean pass as broken", () => {
    expect(sweepPatch(bookmark("a"), {})).toEqual({ id: "a", urlStatus: BROKEN });
    expect(sweepPatch(bookmark("a"), { status: "idle" })).toEqual({ id: "a", urlStatus: BROKEN });
  });
});

describe("the record of past checks", () => {
  it("reads back what it wrote", () => {
    const stored = JSON.stringify(recordChecked({}, ["a", "b"], 1234));

    expect(readCheckedAt(stored)).toEqual({ a: 1234, b: 1234 });
  });

  it("drops anything that is not a time", () => {
    expect(readCheckedAt('{"a": "yesterday", "b": -1, "c": 5}')).toEqual({ c: 5 });
    expect(readCheckedAt("not json")).toEqual({});
    expect(readCheckedAt(undefined)).toEqual({});
    expect(readCheckedAt("[1,2]")).toEqual({});
  });

  it("forgets bookmarks that are gone, so it cannot grow without bound", () => {
    const before = { gone: 1, kept: 1 };

    expect(recordChecked(before, ["kept"], 2, new Set(["kept"]))).toEqual({ kept: 2 });
  });
});
