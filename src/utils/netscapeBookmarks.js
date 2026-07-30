// The Netscape bookmark file format ("bookmarks.html"), in both directions.
// Export and import live together because they have to agree: #40 was a folder
// round-trip loss caused by a writer and a reader that had drifted apart.
//
// Folder nesting is expressed the way browsers express it — an <H3> label
// followed by a sibling <DL> — and maps to the app's slash-separated folderId
// path. TAGS is the attribute Firefox exports; RATING is a Bookmarkit addition
// that other browsers ignore.

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

// Walk out through the enclosing <DL> elements, collecting the <H3> label that
// introduces each one. The HTML parser nests a folder's <DL> inside the <DT>
// that holds its <H3>, so the label is that <DL>'s previous element sibling.
function folderPathFor(link) {
  const segments = [];
  let list = link.closest("dl");
  while (list) {
    const label = list.previousElementSibling;
    if (label?.tagName === "H3") {
      const title = label.textContent.replace(/\s+/gu, " ").trim();
      if (title) segments.unshift(title);
    }
    list = list.parentElement?.closest("dl");
  }
  return segments.join("/");
}

/**
 * Read every bookmark out of a Netscape bookmark file. URL safety, duplicate
 * filtering, and messaging stay with the caller.
 * @param {string} html
 * @returns {Array<object>}
 */
export function parseNetscapeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
  const now = new Date().toISOString();
  return Array.from(doc.querySelectorAll("a[href]")).map((link) => {
    const addDate = parseInt(link.getAttribute("add_date"), 10);
    const rating = parseInt(link.getAttribute("rating"), 10);
    return {
      title: link.textContent.trim() || link.href,
      url: link.href,
      description: link.getAttribute("description") || "",
      tags: parseTags(link.getAttribute("tags")),
      rating: Number.isNaN(rating) ? 0 : rating,
      folderId: folderPathFor(link),
      faviconUrl: link.getAttribute("icon") || "",
      createdAt: Number.isNaN(addDate) ? now : new Date(addDate * 1000).toISOString(),
      updatedAt: now,
    };
  });
}
