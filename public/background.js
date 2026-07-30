// background.js — the extension's privileged background surface: the ways in that
// do not go through a page (omnibox, context menu), and the URL check that needs
// to bypass CORS.
//
// This file is copied into the package verbatim, so it cannot import from src/.
// Anything mirrored from the app says so at the point of duplication.

// #51: the toolbar icon opens the quick-add popup (action.default_popup in the
// manifest), so chrome.action.onClicked no longer fires and the old open-in-a-tab
// listener is gone. #52 adds the keyboard route to the same popup with an
// _execute_action command, which Chrome dispatches itself — no listener here.
// The popup links out to the full app.

// #10: A host is private/loopback/link-local (or non-public). Mirrors
// isPrivateOrLoopbackHost in src/utils/url.js (the service worker can't import
// the app bundle). Keep the two in sync.
function isPrivateIpv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  return false;
}

function mappedIpv4(host) {
  const m = host.match(/^::ffff:(.+)$/i);
  if (!m) return null;
  const rest = m[1];
  if (rest.includes(".")) return rest;
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const hi = parseInt(parts[0], 16);
  const lo = parseInt(parts[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

function isPrivateOrLoopbackHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isPrivateIpv4(host)) return true;
  if (host.includes(":")) {
    // IPv6 literal only — never match domains that merely start with these.
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local
    if (host.startsWith("fe80")) return true; // link-local
    const v4 = mappedIpv4(host);
    if (v4 && isPrivateIpv4(v4)) return true;
  }
  return false;
}

// A URL we would be willing to open, or null. Mirrors isSafeHttpUrl in
// src/utils/url.js. Bookmarking a private host is legitimate; fetching one from
// this worker is not, which is why isPublicHttpUrl is the stricter of the two.
function httpUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isPublicHttpUrl(raw) {
  const url = httpUrl(raw);
  return Boolean(url) && !isPrivateOrLoopbackHost(url.hostname);
}

// #48: How much of a page is read before the rest is dropped. Enough for a head
// and some opening prose; small enough that a hostile or enormous page cannot
// cost the worker its memory.
const PAGE_BYTE_CAP = 256 * 1024;

// Read at most `cap` bytes of the body and stop, cancelling the rest rather than
// waiting for a stream that may never end.
async function readCapped(response, cap) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let read = 0;
  try {
    while (read < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      // One chunk can be larger than what is left of the allowance, so the cap is
      // enforced on the bytes taken, not on the bytes asked for.
      const remaining = cap - read;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      read += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text;
}

// #48: Fetch a page so the app can read what it says about itself. Same two
// guards as CHECK_URL — our own extension pages only, public http(s) only — plus:
//  - `credentials: "omit"`, so the user's cookies are never sent. What comes back
//    is the page as an anonymous visitor sees it, never their logged-in view.
//  - `redirect: "manual"`, for the reason #10 gives: a 30x Location can name an
//    internal host, and the redirected request would fire before we could look.
//  - HTML only, and only the first PAGE_BYTE_CAP bytes of it.
// The HTML is handed back as a string. Parsing happens in the app, by scanning
// the string — a service worker has no DOM, and this is not markup to build one
// from anyway.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "FETCH_PAGE_META") return false;
  if (sender.id !== chrome.runtime.id) return false;
  if (!isPublicHttpUrl(message.url)) {
    sendResponse({ ok: false });
    return false;
  }
  fetch(message.url, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    signal: AbortSignal.timeout(5000),
  })
    .then(async (res) => {
      const type = res.headers.get("content-type") || "";
      if (res.type === "opaqueredirect" || !res.ok || !/text\/html|xhtml/i.test(type)) {
        sendResponse({ ok: false });
        return;
      }
      sendResponse({ ok: true, html: await readCapped(res, PAGE_BYTE_CAP) });
    })
    .catch(() => sendResponse({ ok: false }));
  return true; // keep message channel open for async response
});

// URL validation — runs in the service worker context which bypasses CORS restrictions.
// Returns { status: 'valid'|'invalid', redirectUrl: string|null }
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "CHECK_URL") return false;
  // #10: only accept requests from our own extension pages (not other extensions
  // or web pages), and only fetch public http(s) URLs — never internal hosts (SSRF).
  if (sender.id !== chrome.runtime.id) return false;
  const url = message.url;
  if (!isPublicHttpUrl(url)) {
    sendResponse({ status: "invalid", redirectUrl: null });
    return false;
  }
  // #10 (Codex): do NOT let fetch follow redirects from the privileged worker —
  // a 30x Location could point at an internal host (127.0.0.1 / 169.254.169.254),
  // and the redirected request fires before we could inspect it. `redirect: "manual"`
  // stops the follow; a redirect yields an opaqueredirect response we treat as
  // "reachable, but we don't chase or expose the target."
  fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) })
    .then((res) => {
      if (res.type === "opaqueredirect") {
        sendResponse({ status: "valid", redirectUrl: null });
        return;
      }
      sendResponse({ status: res.ok ? "valid" : "invalid", redirectUrl: null });
    })
    .catch(() => sendResponse({ status: "invalid", redirectUrl: null }));
  return true; // keep message channel open for async response
});

// ─── Reading the collection ──────────────────────────────────────────────────
// #52: The default store keeps its bookmarks in a "bookmarkit" folder on the
// bookmarks bar (see chromeBookmarksStore). This worker reads that folder and
// never creates it: the omnibox reads the collection, it does not own it. Tags
// and ratings live in the app's own metadata, not in Chrome's tree, so they are
// not available here and are not matched on.
const ROOT_FOLDER_TITLE = "bookmarkit";
const MAX_SUGGESTIONS = 8;

async function collectionBookmarks() {
  const [tree] = await chrome.bookmarks.getTree();
  const bar = (tree.children || []).find((n) => n.id === "1" || n.title === "Bookmarks bar");
  const root = (bar?.children || []).find((n) => !n.url && n.title === ROOT_FOLDER_TITLE);
  if (!root) return [];

  const found = [];
  const walk = (node) => {
    if (node.url) found.push(node);
    (node.children || []).forEach(walk);
  };
  walk((await chrome.bookmarks.getSubTree(root.id))[0]);
  return found;
}

// Every word has to appear somewhere in the title or the address, so typing more
// narrows rather than widens. Deliberately not the app's searchBookmarks: that
// also reads description and tags, which this surface cannot see, and an address
// bar that waited on anything would feel broken.
function matchBookmarks(query, bookmarks) {
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return [];
  return bookmarks
    .filter((bookmark) => {
      const haystack = `${bookmark.title || ""} ${bookmark.url || ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, MAX_SUGGESTIONS);
}

// ─── Omnibox: "bm <query>" ───────────────────────────────────────────────────
// Suggestion descriptions are parsed as XML by Chrome, so a title containing
// & or < would otherwise break the whole suggestion list.
const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const found = matchBookmarks(text, await collectionBookmarks());
  chrome.omnibox.setDefaultSuggestion({
    description:
      found.length > 0
        ? `bookmarkit — ${found.length} match${found.length === 1 ? "" : "es"} for "${escapeXml(text)}"`
        : `bookmarkit — nothing saved matches "${escapeXml(text)}"`,
  });
  suggest(
    found.map((bookmark) => ({
      content: bookmark.url,
      description: `<match>${escapeXml(bookmark.title || bookmark.url)}</match> <dim>${escapeXml(bookmark.url)}</dim>`,
    }))
  );
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  // Enter on a suggestion hands back that bookmark's address. Enter on the typed
  // query means no suggestion was picked, so the best match is what was meant.
  const url = httpUrl(text) ? text : matchBookmarks(text, await collectionBookmarks())[0]?.url;
  if (!url) return;
  if (disposition === "newForegroundTab") await chrome.tabs.create({ url });
  else if (disposition === "newBackgroundTab") await chrome.tabs.create({ url, active: false });
  else await chrome.tabs.update({ url });
});

// ─── Context menu: bookmark this page, or this link ──────────────────────────
// The action popup cannot be opened from here, so quick add is opened as its own
// small window with the target in the query string. That is also the only way to
// bookmark a link: its address is not the active tab's.
const QUICK_ADD_MENU_ID = "bookmarkit-quick-add";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: QUICK_ADD_MENU_ID,
    title: "Bookmark with bookmarkit",
    contexts: ["page", "link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== QUICK_ADD_MENU_ID) return;
  const onALink = Boolean(info.linkUrl);
  const url = onALink ? info.linkUrl : info.pageUrl || tab?.url;
  if (!httpUrl(url)) return;

  const target = new URL(chrome.runtime.getURL("popup.html"));
  target.searchParams.set("url", url);
  // A link's text is the best title available for it; the page's own title is
  // wrong for a link and the popup would rather fall back to the address.
  const title = onALink ? info.selectionText || "" : tab?.title || "";
  if (title) target.searchParams.set("title", title);

  await chrome.windows.create({ url: target.href, type: "popup", width: 400, height: 560 });
});
