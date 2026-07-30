// ARCH-06: Duplicate detection extracted from BookmarkApp.jsx — pure function, no React deps.

import { normalizeUrl } from "./url.js";

/**
 * #45: Two bookmarks are the same when they point at the same page, regardless
 * of title — the same article saved twice usually differs in title, and the
 * title is the field a user edits. Bookmarks with no URL fall back to their
 * title so they do not all collide on the empty key.
 */
export const getDuplicateKey = (bookmark) => {
  const url = normalizeUrl(bookmark?.url);
  return url || `title:${(bookmark?.title || "").trim().toLowerCase()}`;
};

// #45: How much a copy is worth keeping. Deleting the annotated copy and keeping
// the bare one loses work that cannot be recovered from the other bookmark.
const metadataWeight = (bookmark) =>
  (bookmark?.tags?.length ? 1 : 0) +
  (bookmark?.rating ? 1 : 0) +
  (bookmark?.description?.trim() ? 1 : 0);

/**
 * Returns IDs of duplicate bookmarks — every copy except the one worth keeping.
 * The copy carrying the most metadata wins; ties keep the earliest occurrence.
 * @param {Array} list
 * @returns {string[]}
 */
export const findDuplicateIds = (list = []) => {
  const keeping = new Map();
  const duplicates = [];
  for (const bookmark of list) {
    const key = getDuplicateKey(bookmark);
    const kept = keeping.get(key);
    if (!kept) {
      keeping.set(key, bookmark);
    } else if (metadataWeight(bookmark) > metadataWeight(kept)) {
      keeping.set(key, bookmark);
      duplicates.push(kept.id);
    } else {
      duplicates.push(bookmark.id);
    }
  }
  return duplicates;
};

/**
 * Filters import candidates using the same duplicate rule as findDuplicateIds.
 * Existing bookmarks seed the seen set; duplicates inside the import batch are
 * also skipped so only the first occurrence is imported.
 * @param {Array} incoming
 * @param {Array} existing
 * @returns {{ bookmarks: Array, skippedCount: number }}
 */
export const filterDuplicateImports = (incoming = [], existing = []) => {
  const seen = new Set(existing.map(getDuplicateKey));
  const bookmarks = [];

  for (const bookmark of incoming) {
    const key = getDuplicateKey(bookmark);
    if (seen.has(key)) continue;
    seen.add(key);
    bookmarks.push(bookmark);
  }

  return {
    bookmarks,
    skippedCount: incoming.length - bookmarks.length,
  };
};
