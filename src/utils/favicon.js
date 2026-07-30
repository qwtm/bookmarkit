// #39: Where a bookmark's icon comes from, and what fetching it is allowed to
// reveal. A bookmark list renders every URL a user has saved, so an icon source
// that reaches a third party turns each render into a report of the collection.
//
// Order of preference:
//   1. the icon stored on the bookmark, when showing it costs no request
//   2. Chrome's own favicon cache, which never leaves the browser
//   3. the network — the stored icon's own URL, else a favicon service — but
//      only when the user has opted in
//   4. a local placeholder
//
// With the opt-in off, nothing here reaches the network. A stored faviconUrl is
// not automatically safe: an imported Netscape ICON attribute, or a
// google.com/s2 URL an older version persisted, is someone else's server.

import { isSafeHttpUrl } from "./url.js";

const PLACEHOLDER_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32'>
<rect width='32' height='32' rx='7' fill='#e2e5ea'/>
<circle cx='16' cy='16' r='7' fill='none' stroke='#9aa1ab' stroke-width='1.6'/>
<path d='M9 16h14M16 9c2.6 3.5 2.6 10.5 0 14M16 9c-2.6 3.5-2.6 10.5 0 14' fill='none' stroke='#9aa1ab' stroke-width='1.6'/>
</svg>`;

/** Inline placeholder icon. A data URI, so showing it costs no request. */
export const FAVICON_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

export const REMOTE_FAVICONS_KEY = "bm_remote_favicons";

/** Whether the user has opted in to fetching favicons from a third party. */
export function remoteFaviconsEnabled() {
  try {
    return localStorage.getItem(REMOTE_FAVICONS_KEY) === "true";
  } catch {
    return false;
  }
}

export function setRemoteFaviconsEnabled(enabled) {
  try {
    localStorage.setItem(REMOTE_FAVICONS_KEY, enabled ? "true" : "false");
  } catch {
    /* storage unavailable — the setting simply does not persist */
  }
}

// Chrome's favicon cache, served from the extension's own origin. Requires the
// "favicon" permission and is unavailable to the standalone web build.
function chromeCachedFavicon(pageUrl, size) {
  if (typeof chrome === "undefined" || typeof chrome.runtime?.getURL !== "function") return "";
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}

// An inline icon is just bytes we already hold, so it costs no request and is
// shown whatever the setting says.
const isInlineIcon = (icon) => typeof icon === "string" && icon.startsWith("data:image/");

/**
 * The icon to show for a page.
 * @param {string} pageUrl
 * @param {{ storedIcon?: string, allowRemote?: boolean, size?: number }} [options]
 *   storedIcon is the bookmark's own faviconUrl, which is honored over anything
 *   derived. allowRemote defaults to false: with it off, nothing here reaches
 *   the network.
 * @returns {string}
 */
export function faviconSrc(pageUrl, { storedIcon = "", allowRemote = false, size = 32 } = {}) {
  if (isInlineIcon(storedIcon)) return storedIcon;
  // Once fetching is allowed at all, the icon on the bookmark wins: it is either
  // what the tab reported or what the user typed into the form.
  if (allowRemote && isSafeHttpUrl(storedIcon)) return storedIcon;
  if (!isSafeHttpUrl(pageUrl)) return FAVICON_PLACEHOLDER;
  const cached = chromeCachedFavicon(pageUrl, size);
  if (cached) return cached;
  if (!allowRemote) return FAVICON_PLACEHOLDER;
  // Only the hostname, and encoded — never the path or query, which is what a
  // sensitive bookmark actually leaks.
  const hostname = encodeURIComponent(new URL(pageUrl).hostname);
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`;
}
