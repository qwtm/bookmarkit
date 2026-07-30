// #50: When a bookmark was last actually used.
//
// Everything else the app knows about a bookmark is what someone typed about it.
// `lastOpenedAt` is the one field the app observes for itself, written on the
// single path that opens one, and it answers the question a collection of a
// thousand bookmarks eventually raises: which of these did I never come back to?
//
// Absent means never. There is no "unknown": a bookmark saved before this existed
// reads as never opened, which is the honest answer — nothing recorded it being
// opened.

/** Whether nothing has recorded this bookmark being opened. */
export const isNeverOpened = (bookmark) => !bookmark?.lastOpenedAt;

/** When it was last opened, as a timestamp; `0` for never. */
export const openedAt = (bookmark) => {
  const parsed = Date.parse(bookmark?.lastOpenedAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The bookmarks nothing has opened, oldest first — what a triage list wants. */
export const findNeverOpened = (list = []) =>
  list.filter(isNeverOpened).sort((a, b) => addedAt(a) - addedAt(b));

/** When it was saved, as a timestamp; `0` when it does not say. */
export const addedAt = (bookmark) => {
  const parsed = Date.parse(bookmark?.createdAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * The patch that records an open.
 *
 * It is deliberately only this field: opening is not editing, and a write that
 * carried anything else would put an "undo opening a bookmark" on the stack.
 */
export const openedPatch = (now = Date.now()) => ({
  lastOpenedAt: new Date(now).toISOString(),
});
