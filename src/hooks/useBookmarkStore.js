// ARCH-06: Encapsulates store selection, init, CRUD operations, and subscription.
// ARCH-08: Implements cancelled flag + cleanup to prevent setState-after-unmount.
// UX-06: Exposes importProgress state for bulk-import feedback.
// #56: Every write records how to undo itself, here rather than at each call
// site, so a new caller cannot forget to.

import { useCallback, useRef, useState } from "react";
import { getStore, STORE_TYPES } from "../stores/index.js";
import { inverseOf } from "../utils/bookmarkUndo.js";
import { previousValuesFor } from "../utils/bulkEdit.js";

const firebaseConfig =
  typeof __firebase_config !== "undefined" ? JSON.parse(__firebase_config) : undefined;
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const initialAuthToken =
  typeof __initial_auth_token !== "undefined" ? __initial_auth_token : undefined;

/**
 * @typedef {{ total: number, done: number } | null} ImportProgress
 */

/**
 * Turns a write that happened into an entry the undo history can hold.
 *
 * The `undoing` flag is why this is worth naming: an inverse runs through the
 * ordinary write helpers, and those record too, so without it a second Cmd+Z
 * would redo the write the first one just took back.
 */
const recorderFor =
  ({ recordUndo, undoing, writes }) =>
  (operation) => {
    if (!recordUndo || undoing.current) return;
    const inverse = inverseOf(operation);
    if (!inverse) return;
    recordUndo({
      label: inverse.label,
      destructive: inverse.destructive,
      endsHistory: inverse.endsHistory,
      undo: async () => {
        undoing.current = true;
        try {
          await inverse.apply(writes.current);
        } finally {
          undoing.current = false;
        }
      },
    });
  };

/**
 * @param {(entry: object|null) => void} [recordUndo] Offered the inverse of each
 *   write that succeeds. Surfaces without an undo affordance — the popup — leave
 *   it out and nothing is recorded.
 */
export function useBookmarkStore(recordUndo) {
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // #18: Set when the collection could not be opened at all. Distinct from
  // "loaded and empty", which is a legitimate state a user can write into.
  const [loadError, setLoadError] = useState(null);
  const [importProgress, setImportProgress] = useState(null); // UX-06
  const storeRef = useRef(null);

  // The current list, read when a write needs to know what it is about to
  // replace. A dependency on `bookmarks` would rebuild every write on every
  // change to the collection.
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;

  const undoingRef = useRef(false);
  // Read at call time: an inverse is expressed in terms of these helpers, and
  // they are only complete once the whole hook has been built.
  const writesRef = useRef(null);

  const remember = useCallback(
    (operation) => recorderFor({ recordUndo, undoing: undoingRef, writes: writesRef })(operation),
    [recordUndo]
  );

  // init() must be called once on mount inside a useEffect with cleanup
  const init = useCallback(
    /**
     * @param {(msg: string, type?: string) => void} showMessage
     * @returns {() => void} cleanup
     */
    (showMessage) => {
      let cancelled = false;
      let unsub;
      (async () => {
        const preferred =
          typeof __use_firebase__ !== "undefined" && __use_firebase__
            ? STORE_TYPES.FIREBASE
            : STORE_TYPES.LOCAL;
        const s = await getStore(preferred, {
          firebaseConfig,
          appId,
          initialAuthToken,
          // #18: A store that loses its subscription keeps the last list it
          // emitted rather than emptying it, so the staleness has to be said out
          // loud — otherwise the next save is made against a view we know is old.
          onError: (error) => {
            if (cancelled) return;
            showMessage?.(
              `Could not refresh bookmarks, so this is the last loaded copy. ${error?.message || ""}`.trim(),
              "error"
            );
          },
        });
        await s.init();
        // #19: An unmount during init still has to release the store's backend
        // listeners, which init() has already registered by this point. Until the
        // read below publishes it, this is the only reference to it — the cleanup
        // function has nothing to reach.
        if (cancelled) {
          s.teardown?.();
          return;
        }
        const data = await s.list();
        if (cancelled) {
          s.teardown?.();
          return;
        }
        // #18: The store becomes writable only once it has been read. Publishing
        // it before the first read meant a rejected read left the app on an
        // empty list that every write path was happy to add to.
        storeRef.current = s;
        setBookmarks(data);
        setIsLoading(false);
        unsub = s.subscribe((all) => {
          if (!cancelled) setBookmarks(all);
        });
      })().catch((error) => {
        if (cancelled) return;
        // #18: Without this the failure was an unhandled rejection and isLoading
        // stayed true, leaving the app on a spinner with nothing to explain it.
        setLoadError(error?.message || String(error));
        setIsLoading(false);
        showMessage?.(`Could not open your bookmarks. ${error?.message || error}`, "error");
      });
      return () => {
        cancelled = true;
        unsub?.();
        storeRef.current?.teardown?.();
        storeRef.current = null;
      };
    },
    []
  );

  const saveBookmark = useCallback(
    async (bookmarkToSave, showMessage) => {
      if (!storeRef.current) {
        showMessage?.("Error: Bookmark store is not initialized. Please reload.", "error");
        return;
      }
      if (bookmarkToSave.id) {
        const { id, ...patch } = bookmarkToSave;
        const previous = bookmarksRef.current.find((b) => b.id === id);
        await storeRef.current.update(id, { ...patch, updatedAt: new Date().toISOString() });
        remember({ kind: "edit", previous });
      } else {
        const created = await storeRef.current.create({
          ...bookmarkToSave,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        remember({ kind: "create", created });
      }
    },
    [remember]
  );

  const deleteBookmark = useCallback(async (id) => {
    if (!storeRef.current) return;
    await storeRef.current.remove(id);
  }, []);

  const deleteBookmarks = useCallback(
    async (ids) => {
      if (!storeRef.current) return;
      // Captured before the write, and complete with metadata: restoring gutted
      // bookmarks is not restoring them.
      const removed = bookmarksRef.current.filter((b) => ids.includes(b.id));
      if (typeof storeRef.current.removeMany === "function") {
        await storeRef.current.removeMany(ids);
      } else {
        for (const id of ids) {
          try {
            await storeRef.current.remove(id);
          } catch {}
        }
      }
      remember({ kind: "delete", removed });
    },
    [remember]
  );

  const saveAllBookmarks = useCallback(
    async (arr) => {
      if (!storeRef.current) return;
      const replaced = bookmarksRef.current;
      await storeRef.current.bulkReplace(arr);
      remember({ kind: "replaceAll", replaced });
    },
    [remember]
  );

  // UX-06: appendBookmarks shows importProgress during the sequential fallback path
  const appendBookmarks = useCallback(
    async (arr, showMessage) => {
      if (!storeRef.current) return;
      setImportProgress({ total: arr.length, done: 0 });
      const added = [];
      try {
        if (storeRef.current.bulkAdd) {
          added.push(...((await storeRef.current.bulkAdd(arr)) || []));
          setImportProgress({ total: arr.length, done: arr.length });
        } else {
          // Sequential fallback with per-item progress
          for (let i = 0; i < arr.length; i++) {
            added.push(await storeRef.current.create(arr[i]));
            setImportProgress({ total: arr.length, done: i + 1 });
          }
        }
        showMessage?.(`Imported ${arr.length} bookmarks successfully.`, "success");
      } finally {
        setImportProgress(null);
      }
      remember({ kind: "append", added });
    },
    [remember]
  );

  const persistSortedOrder = useCallback(
    async (params) => {
      if (!storeRef.current) return;
      const order = bookmarksRef.current.map((b) => b.id);
      await storeRef.current.persistSortedOrder?.(params);
      remember({ kind: "reorder", order });
    },
    [remember]
  );

  const reorderBookmarks = useCallback(async (orderedIds) => {
    await storeRef.current?.reorderBookmarks?.(orderedIds);
  }, []);

  // #54: One write and one undo entry for a whole selection. Stores that can do
  // it in a single round-trip say so with updateMany; the rest are walked, which
  // is what the shape of the contract already assumes elsewhere.
  const applyBulkEdit = useCallback(
    async (patches) => {
      if (!storeRef.current || !patches?.length) return;
      const previousPatches = previousValuesFor(patches, bookmarksRef.current);
      if (typeof storeRef.current.updateMany === "function") {
        await storeRef.current.updateMany(patches);
      } else {
        for (const { id, ...patch } of patches) {
          await storeRef.current.update(id, patch);
        }
      }
      remember({ kind: "bulkEdit", previousPatches });
    },
    [remember]
  );

  const writes = {
    saveBookmark,
    deleteBookmarks,
    saveAllBookmarks,
    appendBookmarks,
    reorderBookmarks,
    applyBulkEdit,
  };
  writesRef.current = writes;

  return {
    bookmarks,
    isLoading,
    loadError,
    importProgress,
    storeRef,
    init,
    deleteBookmark,
    persistSortedOrder,
    ...writes,
  };
}
