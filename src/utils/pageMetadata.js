// #48: What a page says about itself.
//
// An opaque URL like example.com/p/8812 tells a model nothing, so the page is
// asked instead: its <title>, its description meta tags, and a little of its
// text. That is enough for a useful description and tags where the URL alone was
// hopeless.
//
// The fetch happens in the service worker, which is the only context that can do
// it without CORS and the only one holding the SSRF guard (#10). The parsing
// happens here, by scanning the string — never by building a DOM. Fetched HTML is
// the most untrusted input this app handles, and #40 already replaced a DOMParser
// on the import path for the same reason: nothing here can execute, load a
// subresource, or resolve a URL, because there is no document.

const TEXT_CAP = 1200;
const FIELD_CAP = 300;

const EMPTY = Object.freeze({ title: "", description: "", text: "" });

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

const decodeEntities = (value) =>
  value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    const key = body.toLowerCase();
    if (NAMED_ENTITIES[key]) return NAMED_ENTITIES[key];
    if (key.startsWith("#x")) return codePoint(parseInt(key.slice(2), 16), whole);
    if (key.startsWith("#")) return codePoint(parseInt(key.slice(1), 10), whole);
    return whole;
  });

function codePoint(value, fallback) {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

const clean = (value, cap = FIELD_CAP) =>
  decodeEntities(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, cap);

/**
 * An element and everything inside it, ended the way a parser would end it.
 *
 * A closing tag is not only `</script>`: `</script foo>` and `</script\n/>` close
 * one too, and an element with no closing tag at all runs to the end of the
 * document. A pattern that insisted on the tidy form would leave a script's body in
 * the prose — which is how a page's code reaches a prompt, and this is the most
 * untrusted input the app handles.
 */
const elementWithBody = (name) =>
  new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?(?:</${name}(?:[\\s/][^>]*)?>|$)`, "gi");

const SCRIPTS = elementWithBody("script");
const STYLES = elementWithBody("style");

// The title is read with the same lenient closer but no run-to-the-end fallback,
// because the two have opposite safe failures: an unterminated script should take
// the rest of the document with it, while an unterminated title should yield no
// title — the body of a page is not its name — and let og:title answer instead.
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title(?:[\s/][^>]*)?>/i;

/** Attributes of one tag, lower-cased names, as a plain object. */
function attributesOf(tag) {
  const attributes = {};
  const pattern = /([a-z0-9-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  let match;
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

/**
 * The description a page offers, preferring its own <meta name="description">
 * over the social-preview copies, which are often truncated for a card.
 */
const DESCRIPTION_KEYS = ["description", "og:description", "twitter:description"];
const TITLE_KEYS = ["og:title", "twitter:title"];

function metaValues(html) {
  const found = new Map();
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = attributesOf(tag);
    const key = (attributes.name || attributes.property || "").toLowerCase();
    const content = clean(attributes.content);
    if (key && content && !found.has(key)) found.set(key, content);
  }
  return found;
}

const firstOf = (values, keys) => keys.map((key) => values.get(key)).find(Boolean) || "";

/**
 * Title, description and a sample of body text, from a page's own markup.
 *
 * @param {string} html
 * @returns {{title: string, description: string, text: string}}
 */
export function extractPageMetadata(html) {
  if (typeof html !== "string" || !html.trim()) return { ...EMPTY };

  // Scripts and styles are not what a page says; dropping them first also keeps
  // their contents out of the text sample.
  const prose = html
    .replace(SCRIPTS, " ")
    .replace(STYLES, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const values = metaValues(prose);
  const titleTag = prose.match(TITLE);

  return {
    title: clean(titleTag?.[1]) || firstOf(values, TITLE_KEYS),
    description: firstOf(values, DESCRIPTION_KEYS),
    text: clean(
      prose.replace(/<\/(?:p|div|li|h[1-6]|br|tr)\s*>/gi, " ").replace(/<[^>]*>/g, " "),
      TEXT_CAP
    ),
  };
}

/** Whether a page said anything worth passing on. */
export const hasPageMetadata = (meta) =>
  Boolean(meta && (meta.title || meta.description || meta.text));

/**
 * Ask the service worker for a page and read what it says about itself.
 *
 * Returns null wherever that is not possible — in the web build there is no
 * worker, and a cross-origin page fetch from a page context is not something CORS
 * will allow — so callers keep their URL-only behavior rather than handling an
 * error.
 *
 * @param {string} url
 * @returns {Promise<{title: string, description: string, text: string}|null>}
 */
export function fetchPageMetadata(url) {
  if (!url || typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "FETCH_PAGE_META", url }, (result) => {
      if (!result?.ok || typeof result.html !== "string") {
        resolve(null);
        return;
      }
      const meta = extractPageMetadata(result.html);
      resolve(hasPageMetadata(meta) ? meta : null);
    });
  });
}
