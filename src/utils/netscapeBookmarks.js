// The Netscape bookmark file format ("bookmarks.html"), in both directions.
// Export and import live together because they have to agree: #40 was a folder
// round-trip loss caused by a writer and a reader that had drifted apart.
//
// Folder nesting is expressed the way browsers express it — an <H3> label
// followed by a sibling <DL> — and maps to the app's slash-separated folderId
// path. TAGS is the attribute Firefox exports; RATING is a Bookmarkit addition
// that other browsers ignore.
//
// Neither direction touches the DOM: the writer builds a string and the reader
// scans one. See the note above TOKEN for why the reader does not parse.

import { escapeHtml } from "./url.js";

const INDENT = "    ";

function folderSegments(folderId) {
  return String(folderId ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

// The TAGS attribute is one comma-separated string in both directions.
function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// A bookmark's tags are not guaranteed to be an array: a JSON import writes
// through whatever the file said. Normalise to the reader's rule rather than
// letting a stored string break the export.
function tagsOf(bookmark) {
  const { tags } = bookmark;
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return typeof tags === "string" ? parseTags(tags) : [];
}

// Group bookmarks into a folder tree. Map preserves insertion order, so the
// exported file keeps the order the caller passed in.
function buildFolderTree(bookmarks) {
  const root = { folders: new Map(), items: [] };
  for (const bookmark of bookmarks || []) {
    let node = root;
    for (const segment of folderSegments(bookmark.folderId)) {
      if (!node.folders.has(segment)) node.folders.set(segment, { folders: new Map(), items: [] });
      node = node.folders.get(segment);
    }
    node.items.push(bookmark);
  }
  return root;
}

function toUnixSeconds(value) {
  if (!value) return "";
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? "" : Math.floor(ms / 1000);
}

// #12: every interpolated field is escaped, so a bookmark containing " < > &
// cannot corrupt the file or inject markup.
function anchorLine(bookmark) {
  const attributes = [
    `HREF="${escapeHtml(bookmark.url)}"`,
    `ADD_DATE="${toUnixSeconds(bookmark.createdAt)}"`,
    `LAST_MODIFIED="${toUnixSeconds(bookmark.updatedAt)}"`,
  ];
  if (bookmark.faviconUrl) attributes.push(`ICON="${escapeHtml(bookmark.faviconUrl)}"`);
  if (bookmark.description) attributes.push(`DESCRIPTION="${escapeHtml(bookmark.description)}"`);
  const tags = tagsOf(bookmark);
  if (tags.length) attributes.push(`TAGS="${escapeHtml(tags.join(","))}"`);
  if (bookmark.rating) attributes.push(`RATING="${escapeHtml(bookmark.rating)}"`);
  return `<A ${attributes.join(" ")}>${escapeHtml(bookmark.title)}</A>`;
}

function renderNode(node, depth) {
  const pad = INDENT.repeat(depth);
  let html = "";
  for (const item of node.items) html += `${pad}<DT>${anchorLine(item)}\n`;
  for (const [title, child] of node.folders) {
    html += `${pad}<DT><H3>${escapeHtml(title)}</H3>\n`;
    html += `${pad}<DL><p>\n`;
    html += renderNode(child, depth + 1);
    html += `${pad}</DL><p>\n`;
  }
  return html;
}

/**
 * Serialize bookmarks as a Netscape bookmark file, nesting each bookmark under
 * its `folderId` path.
 * @param {Array<object>} bookmarks
 * @returns {string}
 */
export function generateNetscapeHtml(bookmarks) {
  return (
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>\n" +
    "<!-- This is an automatically generated file. -->\n" +
    "<!-- DO NOT EDIT! -->\n" +
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
    "<TITLE>Bookmarks</TITLE>\n" +
    "<H1>Bookmarks</H1>\n" +
    "<DL><p>\n" +
    renderNode(buildFolderTree(bookmarks), 1) +
    "</DL><p>\n"
  );
}

// The reader scans the file's text rather than parsing it into a document. A
// bookmark file is a generated, shallow structure that does not need a full HTML
// parser, and staying DOM-free buys two things: the module works in the MV3
// service worker, which has no DOMParser, and untrusted file text never reaches
// an HTML parser at all.
//
// Every token is either a tag or a run of text, and text is collected as it is
// found rather than recovered by removing tags from a captured blob — stripping
// markup after the fact is never complete, since "<b<b>>" survives one pass.
// Attribute values in a bookmark file are escaped, so a tag ends at the first ">".
const TOKEN = /<(?<closing>\/?)(?<name>[a-z][\w:-]*)(?<attributes>[^>]*)>|(?<text>[^<]+)/giu;

const ATTRIBUTE = /([a-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
const MAX_CODE_POINT = 0x10ffff;

// The writer escapes with escapeHtml, and browsers escape too, so reading a
// field means undoing that. An entity we do not recognise is left as written
// rather than guessed at.
function decodeEntities(value) {
  return String(value ?? "").replace(/&(#[Xx]?[0-9A-Fa-f]+|[A-Za-z]+);/gu, (entity, body) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    const hex = body[1] === "x" || body[1] === "X";
    const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
    return code > 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : entity;
  });
}

// The text runs collected between an element's tags, as one title. A label or a
// link's text can carry markup — browsers wrap parts in <B> — and only the text
// of it is a title.
function joinText(runs) {
  return decodeEntities(runs.join("")).replace(/\s+/gu, " ").trim();
}

function attributesOf(tag) {
  const attributes = new Map();
  for (const [, name, quoted, single, bare] of tag.matchAll(ATTRIBUTE)) {
    attributes.set(name.toLowerCase(), decodeEntities(quoted ?? single ?? bare));
  }
  return attributes;
}

// Inverse of toUnixSeconds. A value outside the range a Date can hold counts as
// missing rather than throwing on toISOString.
function fromUnixSeconds(value, fallback) {
  const ms = parseInt(value, 10) * 1000;
  return Number.isNaN(ms) || Math.abs(ms) > 8.64e15 ? fallback : new Date(ms).toISOString();
}

function readAnchor({ attributes: tag, text }, folderPath, now) {
  const attributes = attributesOf(tag);
  const url = attributes.get("href") || "";
  if (!url) return null;
  const rating = parseInt(attributes.get("rating"), 10);
  return {
    title: joinText(text) || url,
    url,
    description: attributes.get("description") || "",
    tags: parseTags(attributes.get("tags")),
    rating: Number.isNaN(rating) ? 0 : rating,
    folderId: folderPath.filter(Boolean).join("/"),
    faviconUrl: attributes.get("icon") || "",
    createdAt: fromUnixSeconds(attributes.get("add_date"), now),
    updatedAt: now,
  };
}

/**
 * Read every bookmark out of a Netscape bookmark file. URL safety, duplicate
 * filtering, and messaging stay with the caller.
 * @param {string} html
 * @returns {Array<object>}
 */
export function parseNetscapeHtml(html) {
  const now = new Date().toISOString();
  const bookmarks = [];
  // One entry per open <DL>, holding the <H3> that introduced it. The outermost
  // list has no label, so it contributes an empty segment.
  const folderPath = [];
  let pendingLabel = "";
  // The <A> or <H3> being read, if any. Tags inside it are passed over and their
  // text still counts, which is how <B> in a title contributes its words.
  let open = null;

  for (const { groups } of String(html ?? "").matchAll(TOKEN)) {
    if (groups.text !== undefined) {
      open?.text.push(groups.text);
      continue;
    }
    const name = groups.name.toLowerCase();
    const closing = Boolean(groups.closing);

    if (name === "dl" && !closing) {
      folderPath.push(pendingLabel);
      pendingLabel = "";
    } else if (name === "dl") {
      folderPath.pop();
    } else if (name === "h3" || name === "a") {
      if (closing && open?.name === name) {
        if (name === "h3") pendingLabel = joinText(open.text);
        else {
          const bookmark = readAnchor(open, folderPath, now);
          if (bookmark) bookmarks.push(bookmark);
        }
      }
      // An unclosed element is abandoned when the next one opens.
      open = closing ? null : { name, attributes: groups.attributes, text: [] };
      if (name === "a" && !closing) pendingLabel = "";
    }
  }

  return bookmarks;
}
