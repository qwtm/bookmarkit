import { describe, it, expect } from "vitest";
import { generateNetscapeHtml, parseNetscapeHtml } from "./netscapeBookmarks.js";

const bookmark = (overrides) => ({
  title: "Example",
  url: "https://example.com/",
  description: "",
  tags: [],
  rating: 0,
  folderId: "",
  faviconUrl: "",
  createdAt: "2024-01-02T03:04:05.000Z",
  updatedAt: "2024-01-02T03:04:05.000Z",
  ...overrides,
});

describe("generateNetscapeHtml (#40)", () => {
  it("nests bookmarks under their folder path", () => {
    const html = generateNetscapeHtml([
      bookmark({ title: "Root item", url: "https://root.test/" }),
      bookmark({ title: "Deep item", url: "https://deep.test/", folderId: "Work/Project A" }),
    ]);

    expect(html).toContain("<DT><H3>Work</H3>");
    expect(html).toContain("<DT><H3>Project A</H3>");
    // The deep item sits inside the inner list, the root item outside every folder.
    expect(html.indexOf("https://root.test/")).toBeLessThan(html.indexOf("<H3>Work</H3>"));
    expect(html.indexOf("<H3>Project A</H3>")).toBeLessThan(html.indexOf("https://deep.test/"));
  });

  it("reuses one folder element for bookmarks sharing a path", () => {
    const html = generateNetscapeHtml([
      bookmark({ url: "https://a.test/", folderId: "Work" }),
      bookmark({ url: "https://b.test/", folderId: "Work" }),
    ]);

    expect(html.match(/<H3>Work<\/H3>/gu)).toHaveLength(1);
  });

  it("escapes folder names and fields", () => {
    const html = generateNetscapeHtml([
      bookmark({ title: 'Ti"tle', folderId: "A<b>", description: "d&d" }),
    ]);

    expect(html).toContain("<H3>A&lt;b&gt;</H3>");
    expect(html).toContain("Ti&quot;tle");
    expect(html).toContain('DESCRIPTION="d&amp;d"');
  });
});

describe("parseNetscapeHtml (#40)", () => {
  it("derives the full nested folder path", () => {
    const parsed = parseNetscapeHtml(`
      <DL><p>
        <DT><H3>Work</H3>
        <DL><p>
          <DT><H3>Project A</H3>
          <DL><p>
            <DT><A HREF="https://deep.test/">Deep</A>
          </DL><p>
        </DL><p>
      </DL><p>`);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].folderId).toBe("Work/Project A");
  });

  it("leaves bookmarks outside any folder at the root", () => {
    const parsed = parseNetscapeHtml('<DL><p><DT><A HREF="https://root.test/">Root</A></DL><p>');

    expect(parsed[0].folderId).toBe("");
  });

  it("reads tags, rating, description, and icon", () => {
    const parsed = parseNetscapeHtml(
      '<DT><A HREF="https://a.test/" TAGS="one, two" RATING="4" DESCRIPTION="Note" ' +
        'ICON="https://a.test/favicon.ico">A</A>'
    );

    expect(parsed[0]).toMatchObject({
      tags: ["one", "two"],
      rating: 4,
      description: "Note",
      faviconUrl: "https://a.test/favicon.ico",
    });
  });

  it("falls back to defaults for a bare anchor", () => {
    const parsed = parseNetscapeHtml('<DT><A HREF="https://a.test/">A</A>');

    expect(parsed[0]).toMatchObject({ tags: [], rating: 0, folderId: "" });
    expect(parsed[0].createdAt).toEqual(expect.any(String));
  });
});

describe("export/import round trip (#40)", () => {
  it("preserves folders, tags, and rating through export and re-import", () => {
    const original = [
      bookmark({ title: "Root", url: "https://root.test/" }),
      bookmark({ title: "Nested", url: "https://nested.test/", folderId: "Work/Project A" }),
      bookmark({
        title: "Tagged",
        url: "https://tagged.test/",
        folderId: "Reading",
        tags: ["react", "perf"],
        rating: 5,
        description: "Worth revisiting",
      }),
    ];

    const reimported = parseNetscapeHtml(generateNetscapeHtml(original));

    expect(reimported.map((b) => [b.title, b.folderId])).toEqual([
      ["Root", ""],
      ["Nested", "Work/Project A"],
      ["Tagged", "Reading"],
    ]);
    expect(reimported[2]).toMatchObject({
      tags: ["react", "perf"],
      rating: 5,
      description: "Worth revisiting",
      createdAt: "2024-01-02T03:04:05.000Z",
    });
  });
});
