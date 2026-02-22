// ARCH-06: Encapsulates store selection, init, CRUD operations, and subscription.
// ARCH-08: Implements cancelled flag + cleanup to prevent setState-after-unmount.
// UX-06: Exposes importProgress state for bulk-import feedback.

import { useCallback, useRef, useState } from "react";
import { getStore, STORE_TYPES } from "../stores/index.js";

const firebaseConfig =
  typeof __firebase_config !== "undefined" ? JSON.parse(__firebase_config) : undefined;
const appId = typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const initialAuthToken =
  typeof __initial_auth_token !== "undefined" ? __initial_auth_token : undefined;

/**
 * @typedef {{ total: number, done: number } | null} ImportProgress
 */

export function useBookmarkStore() {
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importProgress, setImportProgress] = useState(null); // UX-06
  const storeRef = useRef(null);

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
        const s = await getStore(preferred, { firebaseConfig, appId, initialAuthToken });
        await s.init();
        if (cancelled) return;
        storeRef.current = s;
        const data = await s.list();
        if (cancelled) return;
        setBookmarks(data);
        setIsLoading(false);
        unsub = s.subscribe((all) => { if (!cancelled) setBookmarks(all); });
      })();
      return () => { cancelled = true; unsub?.(); };
    },
    [],
  );

  const saveBookmark = useCallback(async (bookmarkToSave, showMessage) => {
    if (!storeRef.current) {
      showMessage?.("Error: Bookmark store is not initialized. Please reload.", "error");
      return;
    }
    if (bookmarkToSave.id) {
      const { id, ...patch } = bookmarkToSave;
      await storeRef.current.update(id, { ...patch, updatedAt: new Date().toISOString() });
    } else {
      await storeRef.current.create({
        ...bookmarkToSave,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, []);

  const deleteBookmark = useCallback(async (id) => {
    if (!storeRef.current) return;
    await storeRef.current.remove(id);
  }, []);

  const deleteBookmarks = useCallback(async (ids) => {
    if (!storeRef.current) return;
    if (typeof storeRef.current.removeMany === "function") {
      await storeRef.current.removeMany(ids);
    } else {
      for (const id of ids) {
        try { await storeRef.current.remove(id); } catch {}
      }
    }
  }, []);

  const saveAllBookmarks = useCallback(async (arr) => {
    if (!storeRef.current) return;
    await storeRef.current.bulkReplace(arr);
  }, []);

  // UX-06: appendBookmarks shows importProgress during the sequential fallback path
  const appendBookmarks = useCallback(async (arr, showMessage) => {
    if (!storeRef.current) return;
    setImportProgress({ total: arr.length, done: 0 });
    try {
      if (storeRef.current.bulkAdd) {
        await storeRef.current.bulkAdd(arr);
        setImportProgress({ total: arr.length, done: arr.length });
      } else {
        // Sequential fallback with per-item progress
        for (let i = 0; i < arr.length; i++) {
          await storeRef.current.create(arr[i]);
          setImportProgress({ total: arr.length, done: i + 1 });
        }
      }
      showMessage?.(`Imported ${arr.length} bookmarks successfully.`, "success");
    } finally {
      setImportProgress(null);
    }
  }, []);

  const persistSortedOrder = useCallback(async (params) => {
    if (!storeRef.current) return;
    await storeRef.current.persistSortedOrder?.(params);
  }, []);

  return {
    bookmarks,
    isLoading,
    importProgress,
    storeRef,
    init,
    saveBookmark,
    deleteBookmark,
    deleteBookmarks,
    saveAllBookmarks,
    appendBookmarks,
    persistSortedOrder,
  };
}
