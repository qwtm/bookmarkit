// #47: The dead-link sweep — paced checking of a whole collection without the UI
// waiting for it.
//
// What is here is pacing and bookkeeping. Which links are worth checking and what
// a result means live in utils/linkHealth.js; the fetch itself is
// utils/urlStatus.js. This hook only decides when to ask and where to put the
// answer.
//
// It runs in the app rather than in a chrome.alarms handler in the service
// worker, because `urlStatus` belongs to the store: the local composite store
// keeps it in localStorage, which a service worker cannot reach at all, and the
// Firebase store needs the signed-in client. A worker writing statuses would be a
// second write path around the store contract. What is persisted instead is the
// record of when each link was last checked, so a sweep resumes across sessions
// rather than restarting.
//
// Sweeping is something the user asks for, not something that happens quietly:
// checking every bookmark contacts every host in the collection, which is the
// same privacy question site icons answered with an opt-in (#39).

import { useCallback, useEffect, useRef, useState } from "react";

import { readSetting, writeSetting } from "../utils/extensionStorage.js";
import {
  BATCH_SIZE,
  countDue,
  nextSweepBatch,
  readCheckedAt,
  recordChecked,
  sweepPatch,
} from "../utils/linkHealth.js";
import { fetchUrlStatus } from "../utils/urlStatus.js";

const CHECKED_AT_KEY = "bookmarkit.linkSweep.checkedAt";

// Paced so a large collection does not look like a scanner to the hosts in it.
const PACING = Object.freeze({
  gapMs: 400, // between individual checks
  batchPauseMs: 2000, // between batches
  maxPauseMs: 30000, // when a batch fails wholesale, back off to here
  idlePollMs: 5000, // while offline or hidden, before looking again
  batchSize: BATCH_SIZE,
});

const IDLE = Object.freeze({ running: false, checked: 0, total: 0 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldWait = () =>
  (typeof navigator !== "undefined" && navigator.onLine === false) ||
  (typeof document !== "undefined" && document.hidden);

/**
 * One batch of checks: which links were really checked, the statuses that
 * changed, and how many could not be reached at all.
 *
 * All three differ. A link already known to be broken changes nothing but still
 * failed, which is what the backoff reads. And a stop mid-batch leaves the rest
 * unchecked, which is what the record of past checks must not claim otherwise —
 * writing the whole batch down would hide those links for a week.
 */
async function checkBatch(batch, { gapMs, keepGoing, onChecked }) {
  const checked = [];
  const patches = [];
  let failed = 0;
  for (const bookmark of batch) {
    if (!keepGoing()) break;
    const result = await fetchUrlStatus(bookmark.url).catch(() => ({ status: "invalid" }));
    checked.push(bookmark.id);
    if (result?.status !== "valid") failed += 1;
    const patch = sweepPatch(bookmark, result);
    if (patch) patches.push(patch);
    onChecked();
    if (gapMs) await sleep(gapMs);
  }
  return { checked, patches, failed };
}

/** Statuses to the store, in one round-trip where the store offers one. */
async function writePatches(store, patches) {
  if (!store || patches.length === 0) return;
  if (typeof store.updateMany === "function") {
    await store.updateMany(patches);
    return;
  }
  for (const { id, ...patch } of patches) await store.update(id, patch);
}

/**
 * Check the collection's links in the background, writing `urlStatus` as answers
 * come back.
 *
 * The writes go straight to the store rather than through the undo-recording
 * helpers: a sweep records what the web already did, and offering to "undo"
 * discovering that a link is dead would mean writing back a status known to be
 * wrong.
 *
 * @param {object} params
 * @param {object[]} params.bookmarks The current collection.
 * @param {{current: object|null}} params.storeRef The live store.
 * @param {(message: string, type?: string) => void} [params.showMessage]
 * @param {object} [params.pacing] Overridable delays and batch size, for tests.
 * @returns {{running: boolean, checked: number, total: number, start: Function, stop: Function}}
 */
export function useLinkSweep({ bookmarks, storeRef, showMessage, pacing }) {
  const [progress, setProgress] = useState(IDLE);

  const runningRef = useRef(false);
  const checkedAtRef = useRef(null);
  // Read at call time so a long sweep sees added and removed bookmarks.
  const latest = useRef(null);
  latest.current = {
    bookmarks,
    storeRef,
    showMessage,
    pacing: { ...PACING, ...(pacing || {}) },
  };

  useEffect(
    () => () => {
      runningRef.current = false;
    },
    []
  );

  const stop = useCallback(() => {
    runningRef.current = false;
    setProgress(IDLE);
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const keepGoing = () => runningRef.current;
    const { showMessage, storeRef, pacing } = latest.current;
    const { gapMs, batchPauseMs, maxPauseMs, idlePollMs, batchSize } = pacing;

    try {
      if (!checkedAtRef.current) {
        checkedAtRef.current = readCheckedAt(await readSetting(CHECKED_AT_KEY));
      }
      const total = countDue(latest.current.bookmarks, checkedAtRef.current);
      if (total === 0) {
        showMessage?.("Every link has been checked recently.", "info");
        return;
      }
      setProgress({ running: true, checked: 0, total });

      let pause = batchPauseMs;
      while (keepGoing()) {
        if (shouldWait()) {
          await sleep(idlePollMs);
          continue;
        }
        const batch = nextSweepBatch(latest.current.bookmarks, checkedAtRef.current, {
          size: batchSize,
        });
        if (batch.length === 0) break;

        const { checked, patches, failed } = await checkBatch(batch, {
          gapMs,
          keepGoing,
          onChecked: () => setProgress((prev) => ({ ...prev, checked: prev.checked + 1 })),
        });
        await writePatches(storeRef.current, patches);

        const liveIds = new Set(latest.current.bookmarks.map((b) => b.id));
        checkedAtRef.current = recordChecked(checkedAtRef.current, checked, Date.now(), liveIds);
        await writeSetting(CHECKED_AT_KEY, JSON.stringify(checkedAtRef.current));

        // A batch where every single link failed usually means the network, not
        // the web: back off rather than condemning the collection at full speed.
        pause =
          failed > 0 && failed === checked.length ? Math.min(pause * 2, maxPauseMs) : batchPauseMs;
        if (keepGoing() && pause) await sleep(pause);
      }
    } catch (error) {
      console.error("Link sweep failed:", error);
      latest.current.showMessage?.("The link check stopped early. Please try again.", "error");
    } finally {
      runningRef.current = false;
      setProgress(IDLE);
    }
  }, []);

  return { ...progress, start, stop };
}
