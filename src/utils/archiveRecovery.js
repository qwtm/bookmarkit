// #102: What to do about a link that no longer answers.
//
// The sweep (#47) finds dead links and deliberately stops there, because deciding
// where a bookmark should now point is not a health check's business. This asks the
// Internet Archive whether it kept a copy, and expresses the answer as a change to
// review — never as a write.
//
// Three rules make asking safe:
//
//   - The question goes to one hard-coded host, and only ever as a query parameter.
//     Nothing here fetches a bookmark's URL, so there is no redirect to follow and
//     no privileged context to protect (#10).
//   - A URL is only asked about if it is a public http(s) URL, the same gate the
//     checks use. An internal hostname is not something to hand a third party.
//   - The address that comes back is a remote server's claim, so it is validated
//     like any other target — public http(s), and on the archive's own host — before
//     it is allowed anywhere near a bookmark.
//
// A snapshot is offered, never applied: `archiveRow` produces a reviewable change
// (utils/changeReview.js), and the user's acceptance is what writes.

import { changeRow } from "./changeReview.js";
import { isBroken } from "./linkHealth.js";
import { isPublicHttpUrl } from "./url.js";

/** The availability API. Hard-coded: the host is ours to choose, not a bookmark's. */
export const AVAILABILITY_ENDPOINT = "https://archive.org/wayback/available";

/** Where a usable snapshot lives. Anything else is not an archive address. */
export const SNAPSHOT_HOST = "web.archive.org";

/** No verdict yet. What a replaced address deserves until the next sweep answers. */
const UNCHECKED = "idle";

const LOOKUP_TIMEOUT_MS = 8000;

/** The bookmarks worth asking about: known broken, and safe to ask about. */
export const recoverable = (list = []) =>
  list.filter((bookmark) => isBroken(bookmark) && isPublicHttpUrl(bookmark?.url));

/** The question, as a URL. Separate from asking it so it can be read in a test. */
export const availabilityUrl = (url) =>
  `${AVAILABILITY_ENDPOINT}?url=${encodeURIComponent(String(url ?? ""))}`;

/**
 * The snapshot in an availability answer, or null when there is not one to trust.
 *
 * The archive answers `{archived_snapshots: {closest: {...}}}`, and an empty object
 * when it has nothing — which is the common case for a link that died young, not an
 * error. A snapshot that is not marked available, did not answer 200, or names a
 * host that is not the archive's is treated as nothing.
 *
 * @param {unknown} payload The parsed JSON body.
 * @returns {{url: string, timestamp: string}|null}
 */
export function readSnapshot(payload) {
  const closest = payload?.archived_snapshots?.closest;
  if (!closest || closest.available !== true) return null;
  if (closest.status && String(closest.status) !== "200") return null;

  const url = onArchiveHost(closest.url);
  if (!url) return null;
  return { url, timestamp: typeof closest.timestamp === "string" ? closest.timestamp : "" };
}

/**
 * The address as https on the archive's host, or null.
 *
 * The archive answers http for historical reasons; upgrading is safe because the
 * host is unchanged and is the one host this module trusts. Any other host means
 * the answer is not what it claims to be and is dropped rather than followed.
 */
function onArchiveHost(value) {
  if (typeof value !== "string" || !value) return null;
  let parsed;
  try {
    parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (parsed.hostname !== SNAPSHOT_HOST) return null;
  parsed.protocol = "https:";
  return isPublicHttpUrl(parsed.href) ? parsed.href : null;
}

/**
 * Ask the archive about one URL.
 *
 * Answers null for "no copy", which includes every way asking can fail — a refused
 * lookup is not worth a message per dead link, and the caller reports the total.
 *
 * @param {string} url
 * @returns {Promise<{url: string, timestamp: string}|null>}
 */
export async function findSnapshot(url) {
  if (!isPublicHttpUrl(url)) return null;
  try {
    const response = await fetch(availabilityUrl(url), {
      credentials: "omit",
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return readSnapshot(await response.json());
  } catch {
    return null;
  }
}

/**
 * A snapshot as the change it would make, or null when it would make none.
 *
 * The address, and the verdict that was about the address being replaced. Nothing
 * else: re-pointing a bookmark is already the largest thing this feature does, and
 * quietly rewriting the title of a bookmark whose page is gone would be a second,
 * unasked-for change. Clearing the stale "broken" is not optional either way — left
 * behind, it would hide a recovered bookmark behind the Broken only filter.
 */
export function archiveRow(bookmark, snapshot) {
  if (!snapshot?.url || snapshot.url === bookmark?.url) return null;
  const status = bookmark?.urlStatus;
  return changeRow(bookmark, {
    url: { before: bookmark.url || "", after: snapshot.url },
    urlStatus: !status || status === UNCHECKED ? null : { before: status, after: UNCHECKED },
    // An imported bookmark can carry the old boolean instead, and a recovered
    // bookmark that kept it would stay behind the Broken only filter forever —
    // nothing in the app writes that field any more, so nothing else would clear it.
    unreachable: bookmark.unreachable === true ? { before: true, after: false } : null,
  });
}
