import { describe, it, expect } from "vitest";
import { readImportedBookmarks } from "./importedBookmarks.js";

const read = (value) => readImportedBookmarks(value, { now: "2024-05-06T07:08:09.000Z" });

describe("readImportedBookmarks (#25)", () => {
  it("rejects entries that are not bookmarks at all", () => {
    const { bookmarks, rejectedCount } = read([
      1,
      "https://example.com",
      null,
      [],
      {},
      { title: "No URL" },
    ]);

    expect(bookmarks).toEqual([]);
    expect(rejectedCount).toBe(6);
  });

  it("rejects URLs the app would refuse to open (#11)", () => {
    const { bookmarks, rejectedCount } = read([
      { url: "javascript:alert(1)" },
      { url: "data:text/html,<script>" },
      { url: "file:///etc/passwd" },
      { url: "not a url" },
      { url: "https://ok.example/" },
    ]);

    expect(bookmarks.map((b) => b.url)).toEqual(["https://ok.example/"]);
    expect(rejectedCount).toBe(4);
  });

  it("fills in the documented shape for a bare entry", () => {
    const { bookmarks } = read([{ url: "https://example.com/page" }]);

    expect(bookmarks[0]).toEqual({
      title: "https://example.com/page",
      url: "https://example.com/page",
      description: "",
      tags: [],
      rating: 0,
      folderId: "",
      faviconUrl: "",
      createdAt: "2024-05-06T07:08:09.000Z",
      updatedAt: "2024-05-06T07:08:09.000Z",
      urlStatus: "valid",
    });
  });

  it("keeps what the file got right", () => {
    const entry = {
      title: "Example",
      url: "https://example.com/",
      description: "Short description",
      tags: ["reference", "web"],
      rating: 4,
      folderId: "work",
      faviconUrl: "https://example.com/favicon.ico",
      createdAt: "2024-01-01T12:00:00.000Z",
      updatedAt: "2024-01-02T12:00:00.000Z",
      urlStatus: "ignored",
    };

    expect(read([entry]).bookmarks[0]).toEqual(entry);
  });

  // These are the shapes that broke components downstream: a rating of "3" left
  // the star control unreachable, and tags as a string threw on .join.
  it("coerces the fields a hand-written file gets wrong", () => {
    const { bookmarks } = read([
      {
        url: "https://example.com/",
        title: 42,
        description: { note: "nope" },
        tags: "react, perf",
        rating: "3",
        folderId: ["work"],
        urlStatus: "probably fine",
      },
    ]);

    expect(bookmarks[0]).toMatchObject({
      title: "https://example.com/",
      description: "",
      tags: ["react", "perf"],
      rating: 3,
      folderId: "",
      urlStatus: "valid",
    });
  });

  it("clamps a rating to 0–5", () => {
    const ratings = [-3, 0, 2.4, 2.6, 9, "excellent", NaN, null];
    const { bookmarks } = read(ratings.map((rating) => ({ url: "https://example.com/", rating })));

    expect(bookmarks.map((b) => b.rating)).toEqual([0, 0, 2, 3, 5, 0, 0, 0]);
  });

  it("replaces an unreadable timestamp rather than storing it", () => {
    const { bookmarks } = read([
      { url: "https://example.com/", createdAt: "last tuesday", updatedAt: 12345 },
    ]);

    expect(bookmarks[0].createdAt).toBe("2024-05-06T07:08:09.000Z");
    expect(bookmarks[0].updatedAt).toBe("2024-05-06T07:08:09.000Z");
  });

  it("drops any id in the file, since the store assigns them", () => {
    const { bookmarks } = read([{ id: "from-the-file", url: "https://example.com/" }]);

    expect(bookmarks[0]).not.toHaveProperty("id");
  });

  it("treats anything that is not an array as nothing to import", () => {
    for (const value of [null, undefined, {}, "[]", 7]) {
      expect(read(value)).toEqual({ bookmarks: [], rejectedCount: 0 });
    }
  });
});
