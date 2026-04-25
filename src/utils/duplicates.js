// ARCH-06: Duplicate detection extracted from BookmarkApp.jsx — pure function, no React deps.

export const getDuplicateKey = (bookmark) =>
  `${(bookmark.title || "").trim().toLowerCase()}|${(bookmark.url || "").trim().toLowerCase()}`;

/**
 * Returns IDs of duplicate bookmarks (same title+url, case-insensitive).
 * The first occurrence is kept; subsequent occurrences are returned as duplicates.
 * @param {Array} list
 * @returns {string[]}
 */
export const findDuplicateIds = (list) => {
  const seen = new Map();
  const dups = [];
  for (const b of list) {
    const key = getDuplicateKey(b);
    if (seen.has(key)) dups.push(b.id);
    else seen.set(key, b.id);
  }
  return dups;
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
