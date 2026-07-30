// #53: Deterministic, LLM-free filtering. These compose the same pure primitives the
// agent plan uses (bookmarkFilters.js), so the manual controls and the agent produce
// identical results for equivalent criteria — the agent is a convenience layer over
// this, not a separate code path.

import {
  searchBookmarks,
  findWithTags,
  filterByRating,
  sortBookmarks,
  normalizeTag,
} from "./bookmarkFilters.js";
import { findBrokenLinks } from "./linkHealth.js";

export const EMPTY_FILTERS = Object.freeze({
  text: "",
  includeTags: [],
  excludeTags: [],
  minRating: 0,
  // #47: only the links the last check could not reach.
  brokenOnly: false,
  sortBy: "",
  order: "asc",
});

/**
 * The fields a manual sort can order by, with the labels the controls show.
 * Kept with the filter semantics rather than in the bar, because a saved view
 * (#49) has to know which values are real when reading one back from storage,
 * and two lists would drift.
 */
export const SORT_FIELDS = Object.freeze([
  { value: "", label: "Default order" },
  { value: "title", label: "Title" },
  { value: "url", label: "URL" },
  { value: "rating", label: "Rating" },
  { value: "folderId", label: "Folder" },
  { value: "createdAt", label: "Date added" },
  { value: "updatedAt", label: "Date modified" },
]);

export const isSortableField = (value) => SORT_FIELDS.some((field) => field.value === value);

// Tag chips cycle through three states rather than offering separate include/exclude
// controls: unset → include → exclude → unset.
export const TAG_STATE = { OFF: "off", INCLUDE: "include", EXCLUDE: "exclude" };

export function getTagState(filters, tag) {
  if (filters.includeTags?.includes(tag)) return TAG_STATE.INCLUDE;
  if (filters.excludeTags?.includes(tag)) return TAG_STATE.EXCLUDE;
  return TAG_STATE.OFF;
}

export function cycleTag(filters, tag) {
  const state = getTagState(filters, tag);
  const include = (filters.includeTags || []).filter((t) => t !== tag);
  const exclude = (filters.excludeTags || []).filter((t) => t !== tag);
  if (state === TAG_STATE.OFF)
    return { ...filters, includeTags: [...include, tag], excludeTags: exclude };
  if (state === TAG_STATE.INCLUDE)
    return { ...filters, includeTags: include, excludeTags: [...exclude, tag] };
  return { ...filters, includeTags: include, excludeTags: exclude };
}

export function hasActiveFilters(filters) {
  if (!filters) return false;
  return Boolean(
    (filters.text || "").trim() ||
    filters.includeTags?.length ||
    filters.excludeTags?.length ||
    filters.minRating > 0 ||
    filters.brokenOnly ||
    filters.sortBy
  );
}

/**
 * Tag facets for the chip row, most frequent first, ties broken alphabetically so
 * the chip order is stable across renders.
 * @returns {{tag: string, count: number}[]}
 */
export function deriveTagCounts(list = []) {
  const counts = new Map();
  for (const b of list) {
    const tags = Array.isArray(b?.tags) ? b.tags : [];
    // A bookmark tagged ["react","React"] must count once, not twice.
    const seen = new Set();
    for (const raw of tags) {
      // Must be the same rule findWithTags matches with, or a chip's count won't agree with
      // what clicking it returns.
      const tag = normalizeTag(raw);
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Apply manual filters on top of an already agent-planned list.
 * Sort runs last so an explicit manual sort wins over any sort the agent applied.
 */
export function applyManualFilters(filters, list = []) {
  if (!filters) return list;
  let result = list;

  const text = (filters.text || "").trim();
  if (text) result = searchBookmarks(text, result);

  if (filters.includeTags?.length || filters.excludeTags?.length) {
    result = findWithTags(filters.includeTags || [], filters.excludeTags || [], result);
  }

  if (filters.minRating > 0) {
    result = filterByRating({ minRating: filters.minRating, comparator: "gte" }, result);
  }

  if (filters.brokenOnly) result = findBrokenLinks(result);

  if (filters.sortBy) {
    result = sortBookmarks(filters.sortBy, filters.order || "asc", result);
  }

  return result;
}
