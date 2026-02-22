// ARCH-06: Duplicate detection extracted from BookmarkApp.jsx — pure function, no React deps.

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
    const key = `${(b.title || "").trim().toLowerCase()}|${(b.url || "").trim().toLowerCase()}`;
    if (seen.has(key)) dups.push(b.id);
    else seen.set(key, b.id);
  }
  return dups;
};
