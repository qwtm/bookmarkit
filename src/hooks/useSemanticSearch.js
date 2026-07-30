// #46: The vector index, kept for as long as it is worth keeping.
//
// Two jobs, and both are about not paying twice: a bookmark is embedded once and
// its vector is stored under a hash of the text it came from, so only genuinely
// changed bookmarks are re-embedded; and once vectors exist, searching is local
// arithmetic — the only request a search makes is for the query itself.
//
// That is also the answer to the fallback cliff (#46): when the agent call fails
// and the app falls back to searching for the raw query, the semantic pass still
// works, because everything but the query vector is already on disk.

import { useCallback, useRef, useState } from "react";

import { embedTexts, embeddingSource, supportsEmbeddings } from "../llm/embeddings.js";
import { isProviderReady } from "../llm/index.js";
import { readSetting, writeSetting } from "../utils/extensionStorage.js";
import {
  contentHash,
  embeddingText,
  rankBySimilarity,
  readIndex,
  staleBookmarks,
  updateIndex,
} from "../utils/semanticSearch.js";

const INDEX_KEY = "bookmarkit.semanticIndex";

/** Embedding requests are batched; this is how many bookmarks go in one. */
const BATCH_SIZE = 50;

/** Provider options with empty values dropped, so provider defaults apply. */
const optionsFor = (providerOptions) => {
  const configured = (typeof __llm_options__ !== "undefined" && __llm_options__) || {};
  const merged = { ...configured, ...(providerOptions || {}) };
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== "" && v != null));
};

const chunk = (list, size) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
};

/**
 * Semantic matches for a query, when there is a way to get them.
 *
 * @param {object} params
 * @param {string} params.provider
 * @param {object} params.providerOptions
 * @param {boolean} params.locked #29: an encrypted key nobody unlocked this session.
 * @returns {{indexing: boolean, search: (query: string, bookmarks: object[]) => Promise<string[]>}}
 *   `search` answers with ranked ids, or an empty list wherever semantic search is
 *   not available — no provider, no embeddings endpoint, a locked key, a failed
 *   request. Callers keep their substring results either way.
 */
export function useSemanticSearch({ provider, providerOptions, locked }) {
  const [indexing, setIndexing] = useState(false);
  const indexRef = useRef(null);

  const latest = useRef(null);
  latest.current = { provider, providerOptions, locked };

  const search = useCallback(async (query, bookmarks = []) => {
    const { provider, providerOptions, locked } = latest.current;
    const chosen =
      provider || (typeof __llm_provider__ !== "undefined" && __llm_provider__) || null;
    const options = optionsFor(providerOptions);

    const term = String(query ?? "").trim();
    if (!term || locked || !chosen) return [];
    if (!supportsEmbeddings(chosen) || !isProviderReady(chosen, options)) return [];

    // What the stored vectors have to have come from to be comparable with the
    // query's: change provider or embedding model and the index is re-earned.
    const source = embeddingSource(chosen, options);

    try {
      if (!indexRef.current) indexRef.current = readIndex(await readSetting(INDEX_KEY));
      await refresh({ provider: chosen, options, source }, bookmarks, indexRef, setIndexing);
      const [queryVector] = await embedTexts(chosen, options, [term]);
      return rankBySimilarity(queryVector, bookmarks, indexRef.current, { source });
    } catch (error) {
      // Recall is the only casualty: the caller's substring results stand.
      console.warn("Semantic search unavailable:", error);
      return [];
    }
  }, []);

  return { indexing, search };
}

/**
 * Embed whatever is missing or changed, then remember it.
 *
 * A batch that fails is skipped rather than failing the search — a partial index
 * still finds things — and the write happens once at the end, because the index is
 * one value in storage.
 */
async function refresh({ provider, options, source }, bookmarks, indexRef, setIndexing) {
  const stale = staleBookmarks(bookmarks, indexRef.current, source);
  if (stale.length === 0) return;

  setIndexing(true);
  try {
    const entries = [];
    for (const batch of chunk(stale, BATCH_SIZE)) {
      const texts = batch.map(embeddingText);
      try {
        const vectors = await embedTexts(provider, options, texts);
        batch.forEach((bookmark, i) => {
          entries.push({
            id: bookmark.id,
            hash: contentHash(texts[i]),
            source,
            vector: vectors[i],
          });
        });
      } catch (error) {
        console.warn("Embedding batch failed:", error);
      }
    }
    if (entries.length === 0) return;
    const liveIds = new Set(bookmarks.map((bookmark) => bookmark.id));
    indexRef.current = updateIndex(indexRef.current, entries, liveIds);
    await writeSetting(INDEX_KEY, JSON.stringify(indexRef.current));
  } finally {
    setIndexing(false);
  }
}
