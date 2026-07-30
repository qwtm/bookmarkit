// A proposed change to a bookmark, in the shape it is reviewed in.
//
// Two features now propose changes rather than making them: the organizer (#44)
// and archive recovery (#102). Both are only tolerable because disagreeing is
// cheap, which means both need the same three things — what the bookmark says now,
// what it would say, and which fields differ — and the same last step of turning
// the rows a user kept into patches for the ordinary bulk-edit write.
//
// So the shape lives here rather than in either of them, and `ChangeReviewModal`
// renders it. Nothing here knows why a change was proposed.

/**
 * One bookmark's proposed change, or null when nothing would change.
 *
 * `changes` is keyed by field, and a field whose entry is null is skipped — that is
 * how a proposal that repeats what a bookmark already says produces no row at all,
 * rather than a row with an empty diff. Field order is the order given.
 *
 * @param {object} bookmark
 * @param {Record<string, {before: unknown, after: unknown}|null>} changes
 * @returns {{id: string, title: string, fields: string[], before: object, after: object}|null}
 */
export function changeRow(bookmark, changes) {
  if (!bookmark?.id) return null;
  const before = {};
  const after = {};

  for (const [field, change] of Object.entries(changes || {})) {
    if (!change) continue;
    before[field] = change.before;
    after[field] = change.after;
  }

  const fields = Object.keys(after);
  if (fields.length === 0) return null;
  return { id: bookmark.id, title: bookmark.title || bookmark.url || "", fields, before, after };
}

/**
 * The patches for the rows the user kept, ready for the bulk-edit write path so a
 * reviewed set is one store write and one undo entry however many rows it held.
 *
 * @param {object[]} rows
 * @param {Set<string>|string[]} accepted Ids the user kept.
 * @returns {object[]}
 */
export function acceptedPatches(rows = [], accepted = []) {
  const keep = accepted instanceof Set ? accepted : new Set(accepted);
  const patches = [];
  for (const row of rows) {
    if (!keep.has(row?.id)) continue;
    patches.push({ id: row.id, ...row.after });
  }
  return patches;
}
