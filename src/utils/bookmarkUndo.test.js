import { describe, it, expect, vi } from "vitest";
import { inverseOf } from "./bookmarkUndo.js";

// An inverse only names a write helper; nothing is called until it is applied.
const writes = () => ({
  saveBookmark: vi.fn().mockResolvedValue(undefined),
  deleteBookmarks: vi.fn().mockResolvedValue(undefined),
  appendBookmarks: vi.fn().mockResolvedValue(undefined),
  saveAllBookmarks: vi.fn().mockResolvedValue(undefined),
  reorderBookmarks: vi.fn().mockResolvedValue(undefined),
  applyBulkEdit: vi.fn().mockResolvedValue(undefined),
});

describe("inverseOf (#56)", () => {
  it("puts an edited bookmark back the way it was", async () => {
    const w = writes();
    const previous = {
      id: "1",
      title: "Old",
      url: "https://old.example",
      description: "was",
      tags: ["a"],
      rating: 3,
      folderId: "f1",
      faviconUrl: "https://old.example/icon.png",
      urlStatus: "ok",
    };

    const inverse = inverseOf({ kind: "edit", previous });
    await inverse.apply(w);

    expect(inverse.label).toBe("Undo edit");
    expect(w.saveBookmark).toHaveBeenCalledWith(previous);
  });

  // A patch is merged, so a field the bookmark did not have has to come back as
  // empty. Omitting it would leave whatever the edit added in place.
  it("clears a field the edit had added", async () => {
    const w = writes();

    await inverseOf({
      kind: "edit",
      previous: { id: "1", title: "Old" },
    }).apply(w);

    expect(w.saveBookmark).toHaveBeenCalledWith({
      id: "1",
      title: "Old",
      description: "",
      tags: [],
      rating: 0,
      folderId: "",
      faviconUrl: "",
      urlStatus: "valid",
    });
  });

  it("leaves a title or URL it never saw alone", async () => {
    const w = writes();

    await inverseOf({ kind: "edit", previous: { id: "1", tags: ["keep"] } }).apply(w);

    const [patch] = w.saveBookmark.mock.calls[0];
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("url");
    expect(patch.tags).toEqual(["keep"]);
  });

  it("does not carry timestamps back into an edit", async () => {
    const w = writes();

    await inverseOf({
      kind: "edit",
      previous: { id: "1", title: "Old", createdAt: "2020-01-01", updatedAt: "2020-01-02" },
    }).apply(w);

    const [patch] = w.saveBookmark.mock.calls[0];
    expect(patch).not.toHaveProperty("createdAt");
    expect(patch).not.toHaveProperty("updatedAt");
  });

  it("removes a bookmark that was just added", async () => {
    const w = writes();

    const inverse = inverseOf({ kind: "create", created: { id: "9", title: "New" } });
    await inverse.apply(w);

    expect(inverse.label).toBe("Undo add");
    expect(w.deleteBookmarks).toHaveBeenCalledWith(["9"]);
  });

  it("restores deleted bookmarks with their metadata", async () => {
    const w = writes();
    const removed = [
      { id: "1", title: "One", tags: ["x"], rating: 5 },
      { id: "2", title: "Two", tags: [], rating: 0 },
    ];

    const inverse = inverseOf({ kind: "delete", removed });
    await inverse.apply(w);

    expect(inverse.label).toBe("Undo delete (2)");
    expect(inverse.destructive).toBe(true);
    expect(w.appendBookmarks).toHaveBeenCalledWith(removed);
  });

  // Restoring goes through the ordinary add paths, and stores mint their own ids
  // there, so anything older in the history refers to bookmarks that are gone.
  it("ends the history when a restore gives bookmarks new identities", () => {
    expect(inverseOf({ kind: "delete", removed: [{ id: "1" }] }).endsHistory).toBe(true);
    expect(inverseOf({ kind: "replaceAll", replaced: [] }).endsHistory).toBe(true);
  });

  it("leaves the history alone for a write that touches known bookmarks", () => {
    expect(inverseOf({ kind: "edit", previous: { id: "1" } }).endsHistory).toBe(false);
    expect(inverseOf({ kind: "create", created: { id: "1" } }).endsHistory).toBe(false);
    expect(inverseOf({ kind: "append", added: [{ id: "1" }] }).endsHistory).toBe(false);
    expect(inverseOf({ kind: "reorder", order: ["1"] }).endsHistory).toBe(false);
    expect(
      inverseOf({ kind: "bulkEdit", previousPatches: [{ id: "1", tags: [] }] }).endsHistory
    ).toBe(false);
  });

  it("keeps the offer to undo a replacement until it is used", () => {
    const inverse = inverseOf({ kind: "replaceAll", replaced: [{ id: "1" }] });

    expect(inverse.label).toBe("Undo replace all (1 bookmark)");
    expect(inverse.destructive).toBe(true);
  });

  it("lets an import be taken back without touching what was there before", async () => {
    const w = writes();

    const inverse = inverseOf({
      kind: "append",
      added: [{ id: "10" }, { id: "11" }],
    });
    await inverse.apply(w);

    expect(inverse.label).toBe("Undo import (2)");
    expect(inverse.destructive).toBe(false);
    expect(w.deleteBookmarks).toHaveBeenCalledWith(["10", "11"]);
  });

  it("ignores imported bookmarks the store gave no id for", async () => {
    const w = writes();

    await inverseOf({ kind: "append", added: [{ id: "10" }, {}, null] }).apply(w);

    expect(w.deleteBookmarks).toHaveBeenCalledWith(["10"]);
  });

  it("takes a whole bulk edit back with one entry", async () => {
    const w = writes();
    const previousPatches = [
      { id: "1", tags: ["react"] },
      { id: "2", tags: [] },
    ];

    const inverse = inverseOf({ kind: "bulkEdit", previousPatches });
    await inverse.apply(w);

    expect(inverse.label).toBe("Undo bulk edit (2)");
    expect(w.applyBulkEdit).toHaveBeenCalledTimes(1);
    expect(w.applyBulkEdit).toHaveBeenCalledWith(previousPatches);
  });

  it("restores the order a sort replaced", async () => {
    const w = writes();

    const inverse = inverseOf({ kind: "reorder", order: ["3", "1", "2"] });
    await inverse.apply(w);

    expect(inverse.label).toBe("Undo sort");
    expect(w.reorderBookmarks).toHaveBeenCalledWith(["3", "1", "2"]);
  });

  // A write that cannot be undone must say so, rather than offer an undo that
  // throws when the user reaches for it.
  it.each([
    ["an edit of a bookmark with no id", { kind: "edit", previous: { title: "x" } }],
    ["a create the store reported no id for", { kind: "create", created: {} }],
    ["a delete of nothing", { kind: "delete", removed: [] }],
    ["an import that added nothing", { kind: "append", added: [] }],
    ["a reorder with no previous order", { kind: "reorder", order: [] }],
    ["a bulk edit that changed nothing", { kind: "bulkEdit", previousPatches: [] }],
    ["a write of an unknown kind", { kind: "somethingElse" }],
  ])("offers no undo for %s", (_name, operation) => {
    expect(inverseOf(operation)).toBeNull();
  });
});
