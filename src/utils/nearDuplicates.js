// #86: The same page saved under two different URLs.
//
// #45 caught the copies a rule can catch: once `normalizeUrl` collapses schemes,
// `www.`, trailing slashes, and tracking parameters, two bookmarks of one URL
// share a key. What no rule catches is a canonical article and its syndicated
// copy, or a paginated page and its print view — different URLs, same reading.
//
// So a model is asked, but only about pairs worth asking about, and only ever for
// an opinion. Everything here is pure: choosing candidates, reading a verdict
// back, and turning verdicts into a proposal. Asking is the hook's job, and
// deleting stays behind the confirmation the user already sees.

import { getDuplicateKey, metadataWeight } from "./duplicates.js";
import { normalizeUrl } from "./url.js";

/** Asking about everything would cost a fortune and answer slowly. */
export const MAX_CANDIDATES = 25;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "to",
  "of",
  "for",
  "in",
  "on",
  "with",
  "how",
  "why",
  "your",
  "you",
]);

/** Enough overlap that two titles are plausibly the same piece of writing. */
const TITLE_OVERLAP = 0.6;

const hostOf = (url) => {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  return normalized.split(/[/?#]/u)[0];
};

const titleTokens = (title) => {
  const tokens = String(title ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  return new Set(tokens);
};

/** Overlap as a share of the smaller title, so a subtitle does not hide a match. */
function titleSimilarity(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/**
 * Why a pair is worth asking about, or null when it is not.
 *
 * Two reasons, and the pair is skipped when a rule already covers it: the same
 * normalized URL is #45's business, not a model's.
 */
export function candidateReason(a, b) {
  if (!a?.url || !b?.url) return null;
  if (getDuplicateKey(a) === getDuplicateKey(b)) return null;
  const similarity = titleSimilarity(a.title, b.title);
  if (similarity >= TITLE_OVERLAP) return "similar titles";
  if (hostOf(a.url) && hostOf(a.url) === hostOf(b.url)) return "same site";
  return null;
}

/**
 * Pairs of bookmarks a model should be asked about, most promising first: a
 * title match is a stronger signal than merely sharing a host.
 *
 * @param {object[]} list
 * @param {{limit?: number}} [options]
 * @returns {{a: object, b: object, reason: string}[]}
 */
export function findNearDuplicateCandidates(list = [], { limit = MAX_CANDIDATES } = {}) {
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const reason = candidateReason(list[i], list[j]);
      if (reason) pairs.push({ a: list[i], b: list[j], reason });
    }
  }
  return pairs
    .sort((x, y) => (x.reason === y.reason ? 0 : x.reason === "similar titles" ? -1 : 1))
    .slice(0, Math.max(0, limit));
}

/**
 * A model's answer, read back as untrusted text.
 *
 * Anything that is not an index into the pairs we asked about, with a boolean
 * verdict, is dropped. A verdict for a pair nobody asked about cannot smuggle a
 * bookmark into a deletion this way.
 *
 * @param {string} text
 * @param {object[]} pairs The candidates, in the order they were asked about.
 * @returns {{pair: number, same: boolean, reason: string}[]}
 */
export function parseDuplicateVerdicts(text, pairs = []) {
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const verdicts = [];
  for (const entry of parsed) {
    const pair = Number(entry?.pair);
    if (!Number.isInteger(pair) || pair < 0 || pair >= pairs.length || seen.has(pair)) continue;
    if (typeof entry?.same !== "boolean") continue;
    seen.add(pair);
    verdicts.push({
      pair,
      same: entry.same,
      reason: String(entry.reason ?? "")
        .replace(/\s+/gu, " ")
        .trim()
        .slice(0, 140),
    });
  }
  return verdicts;
}

function extractJson(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/iu);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * What to propose deleting, and why.
 *
 * Which copy goes is decided the same way #45 decides it — the copy carrying less
 * metadata, since deleting the annotated one loses work — and a bookmark already
 * proposed is never proposed twice, so a chain of pairs cannot empty a group.
 *
 * @returns {{ids: string[], reasons: {id: string, title: string, keptTitle: string, reason: string}[]}}
 */
export function proposeDuplicateRemovals(pairs = [], verdicts = []) {
  const ids = [];
  const reasons = [];
  const spoken = new Set();

  for (const { pair, same, reason } of verdicts) {
    const candidate = pairs[pair];
    if (!same || !candidate || alreadySpokenFor(candidate, spoken)) continue;
    const [keep, drop] = richerFirst(candidate);
    if (!drop?.id) continue;
    spoken.add(candidate.a?.id);
    spoken.add(candidate.b?.id);
    ids.push(drop.id);
    reasons.push({
      id: drop.id,
      title: labelOf(drop),
      keptTitle: labelOf(keep),
      reason: reason || candidate.reason,
    });
  }

  return { ids, reasons };
}

const alreadySpokenFor = ({ a, b }, spoken) => spoken.has(a?.id) || spoken.has(b?.id);

const richerFirst = ({ a, b }) => (metadataWeight(a) >= metadataWeight(b) ? [a, b] : [b, a]);

const labelOf = (bookmark) => bookmark?.title || bookmark?.url || "";
