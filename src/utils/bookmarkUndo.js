// #56: What it takes to put a write back.
//
// Undo used to be a snapshot taken at two call sites, which is why only delete
// and sort had it: every new write would have had to remember to take its own.
// Here the inverse of a write is a value, derived from the write itself, so a
// write path either produces one or visibly does not.
//
// An inverse is expressed in terms of the ordinary write helpers rather than the
// raw store, so restoring goes through the same paths as the original — sequential
// fallbacks, import progress and all — instead of a second, less careful copy.

/**
 * The optional fields an edit can change, each with what "absent" looks like once
 * written. A patch is merged rather than replacing the document, so a field the
 * bookmark did not have cannot simply be omitted from the undo: omitting it would
 * leave the value the edit just added in place. It is sent back as empty instead.
 */
const OPTIONAL_FIELDS = {
  description: "",
  tags: [],
  rating: 0,
  folderId: "",
  faviconUrl: "",
  urlStatus: "valid",
};

/**
 * Fields every bookmark has. Sending an empty title or URL would be worse than
 * leaving one alone, so these are restored only when they were really there.
 * `createdAt` is in neither list: it is not editable, and the store maintains
 * `updatedAt` itself.
 */
const REQUIRED_FIELDS = ["title", "url"];

const editableFieldsOf = (bookmark) => {
  const fields = {};
  for (const field of REQUIRED_FIELDS) {
    if (bookmark[field] !== undefined) fields[field] = bookmark[field];
  }
  for (const [field, empty] of Object.entries(OPTIONAL_FIELDS)) {
    fields[field] = bookmark[field] ?? empty;
  }
  return fields;
};

const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Whether losing this write's effect a second time would cost the user data.
 *
 * A destructive write's offer of undo does not expire, because a timeout on
 * "you just replaced 2,000 bookmarks" is not a safety net. An additive one's
 * does: the collection is intact either way, and a permanent toast is furniture.
 */
const DESTRUCTIVE = new Set(["delete", "replaceAll"]);

/**
 * Writes whose undo brings bookmarks back with new identities.
 *
 * Restoring goes through the ordinary add paths, and every store mints its own
 * ids there, so the restored bookmarks are not the ones that were removed as far
 * as any id is concerned. Older entries in the history refer to the ids that are
 * now gone, which is why undoing one of these ends the history rather than
 * leaving inverses pointing at bookmarks that no longer exist.
 */
const REMINTS_IDS = new Set(["delete", "replaceAll"]);

/** One builder per kind of write. Each yields nothing when there is nothing to undo. */
const INVERSES = {
  edit: ({ previous }) =>
    previous?.id && {
      label: "Undo edit",
      apply: (writes) => writes.saveBookmark({ id: previous.id, ...editableFieldsOf(previous) }),
    },

  // Every store returns the bookmark it created, but an undo that throws is worse
  // than no undo, so an id is required rather than assumed.
  create: ({ created }) =>
    created?.id && {
      label: "Undo add",
      apply: (writes) => writes.deleteBookmarks([created.id]),
    },

  delete: ({ removed }) =>
    removed?.length && {
      label: `Undo delete (${removed.length})`,
      apply: (writes) => writes.appendBookmarks(removed),
    },

  // Recorded even for an empty previous collection: "replace all" on an empty
  // collection is still a write, and its undo is an honest no-op.
  replaceAll: ({ replaced }) => ({
    label: `Undo replace all (${plural(replaced?.length || 0, "bookmark")})`,
    apply: (writes) => writes.saveAllBookmarks(replaced || []),
  }),

  append: ({ added }) => {
    const ids = (added || []).map((b) => b?.id).filter(Boolean);
    return (
      ids.length > 0 && {
        label: `Undo import (${ids.length})`,
        apply: (writes) => writes.deleteBookmarks(ids),
      }
    );
  },

  reorder: ({ order }) =>
    order?.length && {
      label: "Undo sort",
      apply: (writes) => writes.reorderBookmarks(order),
    },
};

/**
 * How to undo one write.
 *
 * @param {object} operation What was done, and what it needs to be undone.
 * @param {"edit"|"create"|"delete"|"replaceAll"|"append"|"reorder"} operation.kind
 * @param {object} [operation.previous] `edit`: the bookmark as it was.
 * @param {object} [operation.created] `create`: the bookmark that now exists.
 * @param {object[]} [operation.removed] `delete`: the bookmarks that were removed,
 *   with their metadata — restoring gutted bookmarks is not restoring them.
 * @param {object[]} [operation.replaced] `replaceAll`: the whole previous collection.
 * @param {object[]} [operation.added] `append`: the bookmarks that were added.
 * @param {string[]} [operation.order] `reorder`: the previous order, by id.
 * @returns {{label: string, destructive: boolean, endsHistory: boolean,
 *   apply: (writes: object) => Promise<void>}|null}
 *   null when the write left nothing to undo — an empty import, or a create the
 *   store did not report an id for. A missing offer is better than one that fails.
 */
export function inverseOf(operation) {
  const built = INVERSES[operation?.kind]?.(operation);
  if (!built) return null;
  return {
    destructive: DESTRUCTIVE.has(operation.kind),
    endsHistory: REMINTS_IDS.has(operation.kind),
    ...built,
  };
}
