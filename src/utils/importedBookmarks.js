// #25: What a JSON import is allowed to become. The file is untrusted — it can
// hold numbers, strings, or objects with a rating of "excellent" and tags as one
// comma-separated string — and whatever gets past here is written to the store
// and read by every component afterwards. Normalising once, here, is what keeps
// the rest of the app from having to defend against each shape separately.

import { isSafeHttpUrl } from "./url.js";

const MAX_RATING = 5;
const URL_STATUSES = new Set(["valid", "invalid", "ignored"]);

const asText = (value) => (typeof value === "string" ? value.trim() : "");

const asTags = (value) => {
  const list = Array.isArray(value) ? value : asText(value).split(",");
  return list.map(asText).filter(Boolean);
};

const asRating = (value) => {
  const rating = Math.round(Number(value));
  return Number.isFinite(rating) ? Math.min(MAX_RATING, Math.max(0, rating)) : 0;
};

const asTimestamp = (value, fallback) => {
  const time = new Date(asText(value)).getTime();
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
};

/**
 * Read an imported array into bookmarks the store can hold.
 *
 * An entry without a URL we would be willing to open is not a bookmark and is
 * rejected outright (#11: http(s) only). Everything else is coerced to the
 * documented shape, and fields the file does not define get their defaults. Any
 * id in the file is dropped: the store assigns ids.
 *
 * @param {unknown} value Parsed JSON, expected to be an array.
 * @param {{ now?: string }} [options]
 * @returns {{ bookmarks: Array<object>, rejectedCount: number }}
 */
export function readImportedBookmarks(value, { now = new Date().toISOString() } = {}) {
  const entries = Array.isArray(value) ? value : [];
  const bookmarks = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !isSafeHttpUrl(entry.url)) continue;
    const url = entry.url.trim();
    bookmarks.push({
      title: asText(entry.title) || url,
      url,
      description: asText(entry.description),
      tags: asTags(entry.tags),
      rating: asRating(entry.rating),
      folderId: asText(entry.folderId),
      faviconUrl: asText(entry.faviconUrl),
      createdAt: asTimestamp(entry.createdAt, now),
      updatedAt: asTimestamp(entry.updatedAt, now),
      urlStatus: URL_STATUSES.has(entry.urlStatus) ? entry.urlStatus : "valid",
    });
  }

  return { bookmarks, rejectedCount: entries.length - bookmarks.length };
}
