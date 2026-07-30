// #54: Turning "do this to those" into patches.
//
// The rules that make bulk editing safe rather than destructive live here, away
// from the bar that collects them and the store that writes them:
//
// - Tags are added and removed, never replaced. Replacing is what makes a bulk
//   retag of 40 bookmarks lose 40 sets of tags.
// - A bookmark that would not change is left out entirely, so applying "add
//   #react" to a selection that mostly has it already writes only the few that
//   do not — and touches only their `updatedAt`.

import { normalizeTag } from "./bookmarkFilters.js";

/**
 * The fields a write through this path may touch, which is what undo has to be able
 * to put back. Deliberately not title.
 *
 * The bar offers only the first three. `description` is here because the organizer
 * (#44) proposes them one at a time through this path, and `url`, `urlStatus` and
 * the legacy `unreachable` flag because archive recovery (#102) re-points a dead
 * link through it — an undo that restored the address but left the bookmark no
 * longer counted as broken would be worse than no undo at all.
 */
const FIELDS = ["tags", "folderId", "rating", "description", "url", "urlStatus", "unreachable"];

/** What "absent" looks like per field, for restoring one. */
const EMPTY = Object.freeze({
  tags: [],
  folderId: "",
  rating: 0,
  description: "",
  url: "",
  urlStatus: "idle",
  unreachable: false,
});

const asTagList = (value) => {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const seen = new Set();
  const tags = [];
  for (const entry of raw) {
    const tag = String(entry ?? "").trim();
    const key = normalizeTag(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
};

/**
 * A change with nothing in it must not be applicable, or "Apply" becomes a way
 * to bump 40 `updatedAt` timestamps for no reason.
 */
export function isEmptyChange(change) {
  if (!change) return true;
  const { addTags, removeTags, folderId, rating } = change;
  return (
    asTagList(addTags).length === 0 &&
    asTagList(removeTags).length === 0 &&
    folderId === undefined &&
    rating === undefined
  );
}

/**
 * Tags after adding and removing, or null when they come out unchanged.
 *
 * Case is respected as typed for new tags but ignored when matching, so adding
 * "React" to a bookmark tagged "react" is not a change, and removing "react"
 * takes "React" with it.
 */
function nextTags(current, add, remove) {
  const removing = new Set(remove.map(normalizeTag));
  const kept = current.filter((tag) => !removing.has(normalizeTag(tag)));
  const present = new Set(kept.map(normalizeTag));
  const appended = add.filter((tag) => !present.has(normalizeTag(tag)));
  const next = [...kept, ...appended];
  const unchanged = next.length === current.length && next.every((tag, i) => tag === current[i]);
  return unchanged ? null : next;
}

/**
 * What a bulk edit would write.
 *
 * @param {object[]} bookmarks The selection, in full — the current values decide
 *   which of them a change actually affects.
 * @param {object} change
 * @param {string[]|string} [change.addTags] Tags to add, as a list or a comma-separated string.
 * @param {string[]|string} [change.removeTags] Tags to remove, matched case-insensitively.
 * @param {string} [change.folderId] Folder path to move into. `""` means the root.
 * @param {number} [change.rating] Rating to set. `0` clears it.
 * @returns {{patches: object[], unchanged: number}} `patches` carry an `id` and
 *   only the fields that differ; `unchanged` counts the selected bookmarks the
 *   change would not have altered.
 */
export function planBulkEdit(bookmarks = [], change = {}) {
  const add = asTagList(change.addTags);
  const remove = asTagList(change.removeTags);
  const patches = [];
  for (const bookmark of bookmarks) {
    const patch = patchFor(bookmark, change, add, remove);
    if (patch) patches.push(patch);
  }
  return { patches, unchanged: bookmarks.length - patches.length };
}

/** The fields of one bookmark this change would alter, or null when it would not. */
function patchFor(bookmark, change, add, remove) {
  if (!bookmark?.id) return null;
  const patch = { id: bookmark.id };

  if (add.length > 0 || remove.length > 0) {
    const tags = nextTags(Array.isArray(bookmark.tags) ? bookmark.tags : [], add, remove);
    if (tags) patch.tags = tags;
  }
  if (change.folderId !== undefined && (bookmark.folderId || "") !== change.folderId) {
    patch.folderId = change.folderId;
  }
  if (change.rating !== undefined && (bookmark.rating || 0) !== change.rating) {
    patch.rating = change.rating;
  }

  return Object.keys(patch).length > 1 ? patch : null;
}

/**
 * The patches that would put `patches` back, read from the bookmarks as they are
 * now. Only the fields each patch touches, so undoing a retag does not also
 * revert a rating someone else changed meanwhile.
 *
 * @returns {object[]} One patch per bookmark still present, in the same order.
 */
export function previousValuesFor(patches = [], bookmarks = []) {
  const byId = new Map(bookmarks.map((b) => [b.id, b]));
  const previous = [];
  for (const patch of patches) {
    const bookmark = byId.get(patch?.id);
    if (!bookmark) continue;
    const before = { id: bookmark.id };
    for (const field of FIELDS) {
      // A field the bookmark does not carry is restored to its own empty value,
      // not to a blank string: undoing a first-ever tagging must write [] back.
      if (field in patch) before[field] = bookmark[field] ?? EMPTY[field];
    }
    if (Object.keys(before).length > 1) previous.push(before);
  }
  return previous;
}

/**
 * How to describe a change before it is applied. The bar says this out loud
 * because "Apply" to 40 bookmarks should not be a surprise.
 */
export function describeBulkEdit(change = {}, count = 0) {
  const parts = [];
  const add = asTagList(change.addTags);
  const remove = asTagList(change.removeTags);
  if (add.length > 0) parts.push(`add ${add.join(", ")}`);
  if (remove.length > 0) parts.push(`remove ${remove.join(", ")}`);
  if (change.folderId !== undefined) {
    parts.push(change.folderId ? `move to ${change.folderId}` : "move to no folder");
  }
  if (change.rating !== undefined) {
    parts.push(change.rating === 0 ? "clear rating" : `rate ${change.rating}`);
  }
  const noun = count === 1 ? "bookmark" : "bookmarks";
  return parts.length === 0 ? "" : `${parts.join(", ")} — ${count} ${noun}`;
}
