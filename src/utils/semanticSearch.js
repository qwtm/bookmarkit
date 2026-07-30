// #46: Finding "that article about vector databases" when those words appear
// nowhere in the bookmark.
//
// Everything here is pure and knows nothing about providers or storage: what text
// represents a bookmark, when that text has changed enough to need re-embedding,
// how close two vectors are, and how a vector ranking is merged with the
// substring search it augments. The requests are llm/embeddings.js and the
// caching is useSemanticSearch.js.
//
// Substring matching is never discarded. It is exact, free, and offline; vectors
// only add the results it could not have found, which is why a missing or stale
// index costs nothing but recall.

/** Below this, a "match" is noise — cosine similarity on unrelated text is not 0. */
export const MIN_SIMILARITY = 0.68;

/** How many semantic hits are worth adding to a substring search. */
export const MAX_SEMANTIC_HITS = 20;

/**
 * What a bookmark says, as one string.
 *
 * The URL is deliberately left out: an opaque `example.com/p/8812` contributes
 * nothing, and a descriptive one repeats the title with punctuation that tokenizes
 * badly. Folder is in, because "Work/Rust" is a statement about the contents.
 */
export function embeddingText(bookmark) {
  const parts = [
    bookmark?.title,
    bookmark?.description,
    Array.isArray(bookmark?.tags) ? bookmark.tags.join(" ") : "",
    String(bookmark?.folderId ?? "").replace(/\//gu, " "),
  ];
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" • ")
    .replace(/\s+/gu, " ")
    .slice(0, 2000);
}

/**
 * A short, stable fingerprint of that text (FNV-1a).
 *
 * Not a cryptographic hash and not trying to be: its only job is to notice that a
 * bookmark's text changed so its vector can be thrown away. A collision costs one
 * stale vector, and nothing here is a security decision.
 */
export function contentHash(text) {
  let hash = 0x811c9dc5;
  const value = String(text ?? "");
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Cosine similarity, or 0 for anything that is not a pair of usable vectors. */
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const similarity = dot / Math.sqrt(normA * normB);
  return Number.isFinite(similarity) ? similarity : 0;
}

/**
 * The stored index, read back defensively.
 *
 * It survives across versions and lives in storage a user can edit, so an entry
 * that is not a hash plus a numeric vector is dropped rather than trusted into a
 * comparison.
 *
 * @param {string|object} raw
 * @returns {Record<string, {hash: string, source: string, vector: number[]}>}
 */
export function readIndex(raw) {
  const parsed = typeof raw === "string" ? tryParse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const clean = {};
  for (const [id, entry] of Object.entries(parsed)) {
    const vector = entry?.vector;
    if (!id || typeof entry?.hash !== "string") continue;
    if (!Array.isArray(vector) || vector.length === 0) continue;
    if (!vector.every((value) => typeof value === "number" && Number.isFinite(value))) continue;
    // A vector from before the index recorded its origin has no known source, so
    // it reads as one nothing matches and gets re-embedded.
    clean[id] = { hash: entry.hash, source: String(entry.source ?? ""), vector };
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

/**
 * The bookmarks whose vector is missing, out of date, or from somewhere else.
 *
 * `source` is what produced the vectors being compared against — provider, model,
 * endpoint. Vectors from two models are not comparable, so a change of provider
 * makes every stored vector stale rather than silently ranking one space against
 * another.
 *
 * @param {object[]} bookmarks
 * @param {Record<string, {hash: string, source?: string}>} index
 * @param {string} [source]
 * @returns {object[]}
 */
export const staleBookmarks = (bookmarks = [], index = {}, source = "") =>
  bookmarks.filter((bookmark) => {
    const text = embeddingText(bookmark);
    if (!bookmark?.id || !text) return false;
    const entry = index[bookmark.id];
    return entry?.hash !== contentHash(text) || (entry?.source ?? "") !== source;
  });

/**
 * The index with these vectors added and vanished bookmarks forgotten.
 *
 * Pruning here rather than on delete keeps the index honest without asking every
 * write path to know it exists.
 */
export function updateIndex(index = {}, entries = [], liveIds) {
  const next = { ...index };
  for (const { id, hash, source = "", vector } of entries) {
    if (id && hash && Array.isArray(vector) && vector.length > 0)
      next[id] = { hash, source, vector };
  }
  if (!liveIds) return next;
  return Object.fromEntries(Object.entries(next).filter(([id]) => liveIds.has(id)));
}

/**
 * The bookmarks a query vector is closest to, best first.
 *
 * @param {number[]} queryVector
 * @param {object[]} bookmarks
 * @param {Record<string, {vector: number[], source?: string}>} index
 * @param {{minSimilarity?: number, limit?: number, source?: string}} [options]
 *   `source` skips vectors from a different provider or model, which a failed
 *   re-embedding can leave behind: comparing across spaces is not a weaker answer
 *   but a meaningless one.
 * @returns {string[]} Matching ids, most similar first.
 */
export function rankBySimilarity(queryVector, bookmarks = [], index = {}, options = {}) {
  const { minSimilarity = MIN_SIMILARITY, limit = MAX_SEMANTIC_HITS, source } = options;
  const scored = [];
  for (const bookmark of bookmarks) {
    const entry = index[bookmark?.id];
    if (!entry) continue;
    if (source !== undefined && (entry.source ?? "") !== source) continue;
    const score = cosine(queryVector, entry.vector);
    if (score >= minSimilarity) scored.push({ id: bookmark.id, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.id);
}

/**
 * A substring result and a vector ranking, as one list.
 *
 * Exact matches come first and in their original order — someone who typed a word
 * that really is in a title expects to see it at the top — then the semantic hits
 * that substring matching missed, in similarity order.
 *
 * @param {object[]} lexical What substring matching found.
 * @param {object[]} all The list being searched, for looking the ranked ids up.
 * @param {string[]} rankedIds
 * @returns {object[]}
 */
export function mergeSemanticMatches(lexical = [], all = [], rankedIds = []) {
  if (rankedIds.length === 0) return lexical;
  const seen = new Set(lexical.map((bookmark) => bookmark?.id));
  const byId = new Map(all.map((bookmark) => [bookmark?.id, bookmark]));
  const merged = [...lexical];
  for (const id of rankedIds) {
    if (seen.has(id)) continue;
    const bookmark = byId.get(id);
    if (bookmark) merged.push(bookmark);
  }
  return merged;
}
