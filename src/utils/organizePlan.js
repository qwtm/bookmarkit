// #44: "Clean up my bookmarks", as data.
//
// A model is shown a slice of the collection and asked for tags, a folder, and a
// description for each entry. Everything about reading that answer back is here,
// and it is all pure: what to ask about, what a proposal is allowed to contain,
// what would actually change, and which patches an accepted set becomes. The
// asking is `useOrganizer`, and the deciding is the review modal — nothing in
// this file writes.
//
// Two things it refuses to do, both because the answer is untrusted text:
//
// - Touch a bookmark that was not in the slice it answers for. An id it invents
//   is dropped rather than looked up.
// - Touch a title or a URL. Those identify the bookmark; a model that renamed
//   what a bookmark points at would be changing which page it is, and the diff
//   would be reviewing something else than the user asked about.

import { extractJsonArray } from "../llm/jsonArray.js";
import { normalizeTag } from "./bookmarkFilters.js";
import { folderSegments } from "./folderTree.js";

/** The fields a proposal may set. Deliberately not `title` or `url`. */
export const ORGANIZE_FIELDS = Object.freeze(["tags", "folderId", "description"]);

/** How many bookmarks go in one request. Small enough to survive a context limit. */
export const CHUNK_SIZE = 20;

const LIMITS = Object.freeze({
  tags: 8,
  tagLength: 32,
  description: 300,
  folderDepth: 3,
  folderSegment: 40,
});

/**
 * The collection in request-sized slices.
 *
 * @param {object[]} list
 * @param {number} [size]
 * @returns {object[][]}
 */
export function chunkForOrganize(list = [], size = CHUNK_SIZE) {
  const step = Math.max(1, size);
  const chunks = [];
  for (let i = 0; i < list.length; i += step) chunks.push(list.slice(i, i + step));
  return chunks;
}

/** The folder paths already in use, so a proposal can be matched against them. */
export const existingFolders = (list = []) => {
  const paths = new Set();
  for (const bookmark of list) {
    const path = String(bookmark?.folderId ?? "").trim();
    if (path) paths.add(path);
  }
  return [...paths].sort();
};

const cleanTags = (value) => {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const seen = new Set();
  const tags = [];
  for (const entry of raw) {
    const tag = String(entry ?? "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, LIMITS.tagLength);
    const key = normalizeTag(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === LIMITS.tags) break;
  }
  return tags;
};

/**
 * A folder path, or "" when the proposal is not one.
 *
 * A path that differs from an existing folder only in case or spacing becomes
 * that folder: the point of organizing is fewer folders, and `Work` beside `work`
 * is how a tidy-up quietly makes the mess worse.
 */
export function cleanFolderPath(value, known = []) {
  const segments = folderSegments(value)
    .slice(0, LIMITS.folderDepth)
    .map((segment) => segment.slice(0, LIMITS.folderSegment));
  if (segments.length === 0) return "";
  const path = segments.join("/");
  const match = known.find((existing) => existing.toLowerCase() === path.toLowerCase());
  return match ?? path;
}

const cleanDescription = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, LIMITS.description);

/**
 * The proposals in a model's answer, keyed by bookmark id.
 *
 * @param {string} text The raw answer.
 * @param {object[]} chunk The bookmarks it was asked about.
 * @param {{folders?: string[]}} [options] Existing folder paths, for matching.
 * @returns {Map<string, {tags?: string[], folderId?: string, description?: string}>}
 */
export function parseOrganizeProposals(text, chunk = [], { folders = [] } = {}) {
  const entries = extractJsonArray(text);
  const allowed = new Set(chunk.map((bookmark) => bookmark?.id).filter(Boolean));
  const proposals = new Map();
  if (!entries) return proposals;

  for (const entry of entries) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    if (!id || !allowed.has(id) || proposals.has(id)) continue;
    const proposal = proposalFrom(entry, folders);
    if (proposal) proposals.set(id, proposal);
  }
  return proposals;
}

/** One entry, cleaned field by field, or null when nothing usable survives. */
function proposalFrom(entry, folders) {
  const proposal = {};

  const tags = entry.tags === undefined ? [] : cleanTags(entry.tags);
  if (tags.length > 0) proposal.tags = tags;

  const folderId = cleanFolderPath(entry.folderId ?? entry.folder, folders);
  if (folderId) proposal.folderId = folderId;

  const description = cleanDescription(entry.description);
  if (description) proposal.description = description;

  return Object.keys(proposal).length > 0 ? proposal : null;
}

const sameTags = (before = [], after = []) =>
  before.length === after.length &&
  before.every((tag, index) => normalizeTag(tag) === normalizeTag(after[index]));

/**
 * A proposal expressed as the change it would make, or null when it would make
 * none. A row is what the review modal shows and what an accepted set applies:
 * one bookmark, and only the fields that differ.
 *
 * Tags are added, never replaced — the same rule bulk editing follows (#54),
 * for the same reason: a tidy-up that dropped hand-written tags would cost more
 * than it gave.
 */
export function organizeRow(bookmark, proposal) {
  if (!bookmark?.id || !proposal) return null;
  const before = {};
  const after = {};

  for (const field of ORGANIZE_FIELDS) {
    const change = CHANGES[field](bookmark, proposal);
    if (!change) continue;
    before[field] = change.before;
    after[field] = change.after;
  }

  const fields = ORGANIZE_FIELDS.filter((field) => field in after);
  if (fields.length === 0) return null;
  return { id: bookmark.id, title: bookmark.title || bookmark.url || "", fields, before, after };
}

/** What each field's proposal would change, field by field, or null for nothing. */
const CHANGES = {
  tags(bookmark, proposal) {
    if (!proposal.tags) return null;
    const current = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    const present = new Set(current.map(normalizeTag));
    const merged = [...current, ...proposal.tags.filter((tag) => !present.has(normalizeTag(tag)))];
    return sameTags(current, merged) ? null : { before: current, after: merged };
  },

  folderId(bookmark, proposal) {
    const current = bookmark.folderId || "";
    if (!proposal.folderId || current === proposal.folderId) return null;
    return { before: current, after: proposal.folderId };
  },

  // An existing description is the user's own writing. A proposal fills the gap
  // where there is none; it does not rewrite what is there.
  description(bookmark, proposal) {
    if (!proposal.description || String(bookmark.description ?? "").trim()) return null;
    return { before: "", after: proposal.description };
  },
};

/**
 * Every change a set of proposals would make, in the order the bookmarks appear.
 *
 * @param {object[]} bookmarks
 * @param {Map<string, object>} proposals
 * @param {{fields?: string[]}} [options] Which fields the user asked about. A
 *   model that answers with more than it was asked for is trimmed, not obeyed.
 * @returns {object[]} Rows, one per bookmark that would actually change.
 */
export function organizeRows(bookmarks = [], proposals = new Map(), { fields } = {}) {
  const wanted = new Set(fields?.length ? fields : ORGANIZE_FIELDS);
  const rows = [];
  for (const bookmark of bookmarks) {
    const row = organizeRow(bookmark, only(proposals.get(bookmark?.id), wanted));
    if (row) rows.push(row);
  }
  return rows;
}

const only = (proposal, wanted) => {
  if (!proposal) return null;
  const kept = {};
  for (const [field, value] of Object.entries(proposal)) {
    if (wanted.has(field)) kept[field] = value;
  }
  return Object.keys(kept).length > 0 ? kept : null;
};

/**
 * The patches for the rows the user accepted, ready for the bulk-edit write path
 * so the whole tidy-up is one undo entry.
 *
 * @param {object[]} rows
 * @param {Set<string>|string[]} accepted Ids the user kept.
 * @returns {object[]}
 */
export function organizePatches(rows = [], accepted = []) {
  const keep = accepted instanceof Set ? accepted : new Set(accepted);
  const patches = [];
  for (const row of rows) {
    if (!keep.has(row?.id)) continue;
    patches.push({ id: row.id, ...row.after });
  }
  return patches;
}
