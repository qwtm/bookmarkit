import { describe, it, expect, afterEach, vi } from "vitest";

import { extractPageMetadata, fetchPageMetadata, hasPageMetadata } from "./pageMetadata.js";

const page = (head, body = "") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

afterEach(() => {
  delete globalThis.chrome;
});

describe("extractPageMetadata", () => {
  it("reads a page's title and its own description", () => {
    const html = page(
      `<title>Rust ownership, explained</title>
       <meta name="description" content="Borrowing without tears.">`
    );

    expect(extractPageMetadata(html)).toMatchObject({
      title: "Rust ownership, explained",
      description: "Borrowing without tears.",
    });
  });

  it("prefers the page's own description over the social-preview copies", () => {
    const html = page(
      `<meta property="og:description" content="Card copy, often cut short…">
       <meta name="description" content="The real one.">`
    );

    expect(extractPageMetadata(html).description).toBe("The real one.");
  });

  it("falls back to og:title when there is no title tag", () => {
    const html = page(`<meta property="og:title" content="Opaque page 8812">`);

    expect(extractPageMetadata(html).title).toBe("Opaque page 8812");
  });

  it("decodes the entities a title actually contains", () => {
    const html = page(`<title>Cats &amp; dogs &#8212; a study &lt;draft&gt;</title>`);

    expect(extractPageMetadata(html).title).toBe("Cats & dogs — a study <draft>");
  });

  it("samples the page's prose, without its scripts or styles", () => {
    const html = page(
      `<style>.a{content:"stylesheet noise"}</style>`,
      `<script>const secret = "script noise";</script>
       <h1>Ownership</h1><p>Every value has one owner.</p>`
    );

    const { text } = extractPageMetadata(html);

    expect(text).toContain("Ownership");
    expect(text).toContain("Every value has one owner.");
    expect(text).not.toContain("noise");
  });

  // A parser ends a script at `</script` followed by whitespace or a slash, not
  // only at the tidy `</script>`. Insisting on the tidy form is how a page keeps
  // its code in the text a model is later shown.
  it("ends a script where a parser would, not only where it is tidy", () => {
    for (const closer of ["</script>", "</script >", "</script\t\n bar>", "</script/>"]) {
      const html = page("", `<script>const secret = "script noise";${closer}<p>Prose.</p>`);

      const { text } = extractPageMetadata(html);

      expect(text).toContain("Prose.");
      expect(text).not.toContain("noise");
    }
  });

  it("drops a script that is never closed, as a parser would", () => {
    const { text } = extractPageMetadata(page("", `<p>Prose.</p><script>const a = "noise";`));

    expect(text).toBe("Prose.");
  });

  it("ends a style and a title on the same lenient terms", () => {
    const html = page(
      `<style>.a{content:"stylesheet noise"}</style bar>
       <title>Ownership</title
       >`,
      "<p>Prose.</p>"
    );

    expect(extractPageMetadata(html)).toMatchObject({
      title: "Ownership",
      text: "Ownership Prose.",
    });
  });

  it("keeps words apart where the markup did", () => {
    const { text } = extractPageMetadata(page("", "<li>first</li><li>second</li>"));

    expect(text).toBe("first second");
  });

  it("caps what it hands on, however long the page is", () => {
    const long = "word ".repeat(5000);
    const meta = extractPageMetadata(page(`<title>${long}</title>`, long));

    expect(meta.title.length).toBeLessThanOrEqual(300);
    expect(meta.text.length).toBeLessThanOrEqual(1200);
  });

  it("returns nothing rather than throwing on input that is not a page", () => {
    expect(extractPageMetadata("")).toEqual({ title: "", description: "", text: "" });
    expect(extractPageMetadata(null)).toEqual({ title: "", description: "", text: "" });
    expect(extractPageMetadata("<title>unclosed")).toEqual({
      title: "",
      description: "",
      text: "unclosed",
    });
  });

  it("says when a page offered nothing worth passing on", () => {
    expect(hasPageMetadata(extractPageMetadata(page("", "   ")))).toBe(false);
    expect(hasPageMetadata(extractPageMetadata(page("<title>Something</title>")))).toBe(true);
  });
});

describe("fetchPageMetadata", () => {
  const withWorker = (respondWith) => {
    globalThis.chrome = {
      runtime: {
        id: "test",
        sendMessage: vi.fn((message, respond) => respond(respondWith(message))),
      },
    };
  };

  it("asks the worker and reads what came back", async () => {
    withWorker(() => ({ ok: true, html: page("<title>From the worker</title>") }));

    await expect(fetchPageMetadata("https://example.com/p/8812")).resolves.toMatchObject({
      title: "From the worker",
    });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: "FETCH_PAGE_META", url: "https://example.com/p/8812" },
      expect.any(Function)
    );
  });

  it("gives up quietly when the worker refuses", async () => {
    withWorker(() => ({ ok: false }));

    await expect(fetchPageMetadata("https://example.com")).resolves.toBeNull();
  });

  it("gives up quietly when a page said nothing", async () => {
    withWorker(() => ({ ok: true, html: page("", "  ") }));

    await expect(fetchPageMetadata("https://example.com")).resolves.toBeNull();
  });

  // The web build has no service worker, and a page context could not fetch a
  // cross-origin page anyway. Callers keep their URL-only behavior.
  it("answers null where there is no worker to ask", async () => {
    await expect(fetchPageMetadata("https://example.com")).resolves.toBeNull();
  });
});
