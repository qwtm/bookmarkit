// #47: Link rot, as data. Everything here is pure: which bookmarks are worth
// checking, what a check result means for the one that was checked, and how the
// record of past checks survives a reload. The fetching itself is urlStatus.js,
// and the pacing is useLinkSweep.js.

import { isPublicHttpUrl } from "./url.js";

/** A bookmark the last check could not reach. */
export const BROKEN = "invalid";

/** The user said this one is fine as it is — never check it, never call it broken. */
export const IGNORED = "ignored";

/** How many links one pass of the sweep checks before pausing. */
export const BATCH_SIZE = 5;

/** A link checked this recently is not worth checking again. */
export const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const isBroken = (bookmark) =>
  bookmark?.urlStatus === BROKEN || bookmark?.unreachable === true;

/** The filter primitive behind both the manual toggle and the agent action. */
export const findBrokenLinks = (list = []) => list.filter(isBroken);

/**
 * A bookmark is checkable when there is a public http(s) URL to check and the
 * user has not opted it out. `isPublicHttpUrl` is the same gate the privileged
 * worker enforces (#10), applied here as well so the sweep never even asks about
 * an internal host.
 */
export const isCheckable = (bookmark) =>
  bookmark?.urlStatus !== IGNORED && isPublicHttpUrl(bookmark?.url);

/**
 * The next few bookmarks to check: never-checked ones first, then the ones
 * checked longest ago, so a sweep interrupted halfway resumes where it stopped
 * rather than starting over.
 *
 * @param {object[]} bookmarks
 * @param {Record<string, number>} checkedAt When each id was last checked, epoch ms.
 * @param {{now?: number, size?: number, recheckAfterMs?: number}} [options]
 */
export function nextSweepBatch(bookmarks = [], checkedAt = {}, options = {}) {
  const { now = Date.now(), size = BATCH_SIZE, recheckAfterMs = RECHECK_AFTER_MS } = options;
  return bookmarks
    .filter(isCheckable)
    .filter((b) => now - (checkedAt[b.id] ?? 0) >= recheckAfterMs)
    .sort((a, b) => (checkedAt[a.id] ?? 0) - (checkedAt[b.id] ?? 0))
    .slice(0, Math.max(0, size));
}

/** How many of these still want checking — the denominator of the progress line. */
export const countDue = (bookmarks = [], checkedAt = {}, options = {}) => {
  const { now = Date.now(), recheckAfterMs = RECHECK_AFTER_MS } = options;
  return bookmarks.filter((b) => isCheckable(b) && now - (checkedAt[b.id] ?? 0) >= recheckAfterMs)
    .length;
};

/**
 * What a check result should write, or null when it agrees with what is stored.
 *
 * Only `urlStatus` is ever written. A redirect target is deliberately not
 * followed home: the privileged worker answers with `redirectUrl: null` by
 * design (#10), because a 30x Location can point at an internal host, and a
 * sweep that re-pointed bookmarks at whatever a redirect claimed would hand
 * that decision to the remote server.
 */
export function sweepPatch(bookmark, result) {
  const status = result?.status === "valid" ? "valid" : BROKEN;
  if (!bookmark?.id || bookmark.urlStatus === status) return null;
  return { id: bookmark.id, urlStatus: status };
}

/**
 * The stored record of past checks, read back defensively: storage is editable
 * by hand and survives across versions, so anything that is not an id mapped to
 * a plausible timestamp is dropped rather than trusted.
 */
export function readCheckedAt(raw) {
  const parsed = typeof raw === "string" ? tryParse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const clean = {};
  for (const [id, at] of Object.entries(parsed)) {
    const time = Number(at);
    if (id && Number.isFinite(time) && time > 0) clean[id] = time;
  }
  return clean;
}

function tryParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Note that these ids were just checked, forgetting bookmarks that are gone. */
export function recordChecked(checkedAt, ids = [], now = Date.now(), liveIds) {
  const next = { ...checkedAt };
  for (const id of ids) next[id] = now;
  if (!liveIds) return next;
  return Object.fromEntries(Object.entries(next).filter(([id]) => liveIds.has(id)));
}
