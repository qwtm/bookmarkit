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

  it("reads ADD_DATE as seconds and ignores one it cannot hold", () => {
    const [dated] = parseNetscapeHtml('<DT><A HREF="https://a.test/" ADD_DATE="1704164645">A</A>');
    expect(dated.createdAt).toBe("2024-01-02T03:04:05.000Z");

    for (const addDate of ["", "tuesday", "999999999999999999"]) {
      const [parsed] = parseNetscapeHtml(
        `<DT><A HREF="https://a.test/" ADD_DATE="${addDate}">A</A>`
      );
      expect(Number.isNaN(new Date(parsed.createdAt).getTime())).toBe(false);
    }
  });

  it("skips an anchor with no address", () => {
    expect(parseNetscapeHtml('<DT><A NAME="anchor">Not a bookmark</A>')).toEqual([]);
  });
});

// Browsers write these files with escaped fields and the odd wrapping tag, and
// they are not consistent about letter case or quoting.
describe("parseNetscapeHtml on what browsers actually write", () => {
  it("undoes the escaping the writer applied", () => {
    const [parsed] = parseNetscapeHtml(
      '<DT><A HREF="https://a.test/?a=1&amp;b=2" DESCRIPTION="d&amp;d &lt;b&gt;">Ti&quot;tle</A>'
    );

    expect(parsed).toMatchObject({
      url: "https://a.test/?a=1&b=2",
      description: "d&d <b>",
      title: 'Ti"tle',
    });
  });

  it("decodes numeric character references", () => {
    const [parsed] = parseNetscapeHtml('<DT><A HREF="https://a.test/">caf&#233;&#x20AC;</A>');

    expect(parsed.title).toBe("café€");
  });

  it("leaves an entity it does not know as written", () => {
    const [parsed] = parseNetscapeHtml('<DT><A HREF="https://a.test/">A &weird; B</A>');

    expect(parsed.title).toBe("A &weird; B");
  });

  it("reads lowercase tags, single quotes, and unquoted values", () => {
    const parsed = parseNetscapeHtml(
      "<dl><p>" +
        "<dt><h3>Work</h3>" +
        "<dl><p><dt><a href='https://a.test/' rating=5>A</a></dl><p>" +
        "</dl><p>"
    );

    expect(parsed[0]).toMatchObject({ folderId: "Work", rating: 5 });
  });

  it("takes only the text from a label or title wrapped in markup", () => {
    const parsed = parseNetscapeHtml(
      "<DL><p><DT><H3><B>Work</B> notes</H3>" +
        '<DL><p><DT><A HREF="https://a.test/">A <B>bold</B>\n  title</A></DL><p></DL><p>'
    );

    expect(parsed[0]).toMatchObject({ folderId: "Work notes", title: "A bold title" });
  });

  // Text is collected as it is scanned, never recovered by removing tags from a
  // captured blob: one pass of that leaves "<scr<script>ipt>" as "<script>". No
  // arrangement of brackets can leave a "<" in a title, so nothing read out of a
  // file can later be read back as an element.
  it("leaves no tag opener in a title, however the brackets are arranged", () => {
    const [parsed] = parseNetscapeHtml(
      '<DT><A HREF="https://a.test/">A<b<b>>title<scr<script>ipt>end</A>'
    );

    expect(parsed.title).not.toContain("<");
    expect(parsed.title).toBe("A>titleipt>end");
  });

  it("keeps sibling folders apart", () => {
    const parsed = parseNetscapeHtml(
      "<DL><p>" +
        '<DT><H3>Work</H3><DL><p><DT><A HREF="https://work.test/">W</A></DL><p>' +
        '<DT><H3>Home</H3><DL><p><DT><A HREF="https://home.test/">H</A></DL><p>' +
        '<DT><A HREF="https://root.test/">R</A>' +
        "</DL><p>"
    );

    expect(parsed.map((b) => b.folderId)).toEqual(["Work", "Home", ""]);
  });

  it("ignores a folder with no name", () => {
    const parsed = parseNetscapeHtml(
      '<DL><p><DT><H3></H3><DL><p><DT><A HREF="https://a.test/">A</A></DL><p></DL><p>'
    );

    expect(parsed[0].folderId).toBe("");
  });

  it("returns nothing for input that holds no bookmarks", () => {
    for (const html of ["", null, undefined, "<html><body>nothing here</body></html>"]) {
      expect(parseNetscapeHtml(html)).toEqual([]);
    }
  });
});

// A JSON import writes tags through as the file gave them, so a stored bookmark
// can carry a string. The export used to call .join on it and throw, which took
// the Import/Export dialog down with it.
describe("export with loosely typed tags", () => {
  it("accepts tags stored as a comma-separated string", () => {
    const html = generateNetscapeHtml([bookmark({ tags: "react, perf" })]);

    expect(html).toContain('TAGS="react,perf"');
    expect(parseNetscapeHtml(html)[0].tags).toEqual(["react", "perf"]);
  });

  it("omits the attribute for tags it cannot read", () => {
    for (const tags of [undefined, null, 42, {}, "", "  ,  "]) {
      expect(generateNetscapeHtml([bookmark({ tags })])).not.toContain("TAGS=");
    }
  });

  it("drops empty entries from an array of tags", () => {
    expect(generateNetscapeHtml([bookmark({ tags: ["react", "", "  ", "perf"] })])).toContain(
      'TAGS="react,perf"'
    );
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
