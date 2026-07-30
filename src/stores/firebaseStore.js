// Firebase implementation conforming to the common store interface
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { chunk, MAX_FIRESTORE_BATCH_OPS } from "./batching.js";

/**
 * @param {object} options
 * @param {(error: Error) => void} [options.onError] Reports a failure that
 *   happens after init has resolved — a dropped subscription, say — which has no
 *   call to reject.
 */
export function createFirebaseStore({ firebaseConfig, appId, initialAuthToken, onError }) {
  let listeners = new Set();
  let unsubSnapshot = null;
  let unsubAuth = null;
  let db = null;
  let auth = null;
  let userId = null;

  const notify = (all) => listeners.forEach((cb) => cb(all));

  const collectionRef = () => collection(db, "artifacts", appId, "users", userId, "bookmarks");

  // #15: Commit a list of write operations in batches of <=500 (the Firestore
  // limit). Each op is a function that applies one write to the passed batch.
  // NOTE: chunking sacrifices cross-chunk atomicity for operations that exceed
  // the limit; a non-destructive/rollback strategy is tracked separately (#18).
  const commitInChunks = async (ops) => {
    for (const group of chunk(ops, MAX_FIRESTORE_BATCH_OPS)) {
      const batch = writeBatch(db);
      group.forEach((applyOp) => applyOp(batch));
      await batch.commit();
    }
  };

  const api = {
    async init() {
      if (!firebaseConfig) throw new Error("firebaseConfig required");
      const app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);
      await new Promise((resolve, reject) => {
        let settled = false;
        // #18: Sign-in failure used to resolve with userId still null, and every
        // later call then built the path artifacts/<appId>/users/null/bookmarks
        // and threw. Fail init instead, so the caller can say what happened.
        //
        // #19: the listener lives in unsubAuth rather than a local, because both
        // ways of settling leave init without ever seeing a user, and a teardown
        // that could not reach it would leak it.
        const settle = (error) => {
          if (settled) return;
          settled = true;
          unsubAuth?.();
          unsubAuth = null;
          if (error) reject(new Error(`Firebase sign-in failed: ${error?.message || error}`));
          else resolve();
        };
        unsubAuth = onAuthStateChanged(
          auth,
          async (user) => {
            if (user) {
              userId = user.uid;
              settle();
              return;
            }
            try {
              if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
              else await signInAnonymously(auth);
              // Success re-enters this callback with a user.
            } catch (error) {
              settle(error);
            }
          },
          settle
        );
        // The observer may have fired before the unsubscribe existed.
        if (settled) {
          unsubAuth?.();
          unsubAuth = null;
        }
      });
      // PERF-04: Enable offline persistence so the app works without network on startup.
      // Requires composite index: position ASC, title ASC (see src/stores/FIREBASE_SETUP.md).
      try {
        await enableIndexedDbPersistence(db);
      } catch (e) {
        if (e.code === "failed-precondition") {
          // Multiple tabs open — persistence only works in one tab at a time.
          console.warn("Firestore offline persistence unavailable: multiple tabs open.");
        } else if (e.code === "unimplemented") {
          // Browser does not support IndexedDB.
          console.warn("Firestore offline persistence unavailable: browser unsupported.");
        }
      }
      // PERF-04: Subscribe to changes with error handler to detect auth/rules failures
      unsubSnapshot = onSnapshot(
        query(collectionRef(), orderBy("position", "asc"), orderBy("title", "asc")),
        (snapshot) => {
          const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          notify(all);
        },
        (error) => {
          // PERF-04: Handle subscription errors (e.g., expired auth token, changed rules)
          // #18: Emitting [] here made every bookmark look deleted, and a save
          // from that view would have been made against an empty list. Keep the
          // last list subscribers received and report the failure instead.
          console.error("Firestore snapshot subscription error:", error);
          onError?.(error);
        }
      );
    },
    async list() {
      const snap = await getDocs(
        query(collectionRef(), orderBy("position", "asc"), orderBy("title", "asc"))
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    // #19: Detach the Firestore snapshot and any still-pending auth listener.
    teardown() {
      unsubSnapshot?.();
      unsubSnapshot = null;
      unsubAuth?.();
      unsubAuth = null;
      listeners.clear();
    },
    async create(bookmark) {
      const ref = await addDoc(collectionRef(), {
        ...bookmark,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await setDoc(ref, { id: ref.id }, { merge: true });
      return { ...bookmark, id: ref.id };
    },
    async update(id, patch) {
      const ref = doc(collectionRef(), id);
      await setDoc(ref, { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
    },
    async remove(id) {
      const ref = doc(collectionRef(), id);
      await deleteDoc(ref);
    },
    async removeMany(ids = []) {
      if (!ids || ids.length === 0) return;
      const ops = ids.map((id) => (batch) => batch.delete(doc(collectionRef(), id)));
      await commitInChunks(ops);
    },
    async bulkReplace(bookmarks) {
      const snap = await getDocs(query(collectionRef()));
      const ops = [];
      snap.forEach((d) => ops.push((batch) => batch.delete(d.ref)));
      bookmarks.forEach((b, index) => {
        const dref = doc(collectionRef());
        const data = {
          ...b,
          id: dref.id,
          position: typeof b.position === "number" ? b.position : index,
          createdAt: b.createdAt || new Date().toISOString(),
          updatedAt: b.updatedAt || new Date().toISOString(),
        };
        ops.push((batch) => batch.set(dref, data));
      });
      await commitInChunks(ops);
    },
    async bulkAdd(bookmarks) {
      // The list query sorts by position then title; new docs get default
      // position and append. Reorder handles explicit ordering afterward.
      const added = [];
      const ops = [];
      bookmarks.forEach((b) => {
        const dref = doc(collectionRef());
        const data = {
          ...b,
          id: dref.id,
          createdAt: b.createdAt || new Date().toISOString(),
          updatedAt: b.updatedAt || new Date().toISOString(),
        };
        ops.push((batch) => batch.set(dref, data));
        added.push(data);
      });
      await commitInChunks(ops);
      return added;
    },
    /**
     * Set explicit order using a position field. Items not in orderedIds keep their relative order and are appended.
     */
    async reorderBookmarks(orderedIds = []) {
      const current = await this.list();
      const existingIds = current.map((b) => b.id);
      const orderedSet = new Set(orderedIds);
      const normalized = [
        ...orderedIds.filter((id) => existingIds.includes(id)),
        ...existingIds.filter((id) => !orderedSet.has(id)),
      ];
      const ops = normalized.map(
        (id, idx) => (batch) =>
          batch.set(
            doc(collectionRef(), id),
            { position: idx, updatedAt: new Date().toISOString() },
            { merge: true }
          )
      );
      await commitInChunks(ops);
    },
    /**
     * Compute a sorted order by field and persist via positions.
     */
    async persistSortedOrder({ sortBy = "title", order = "asc" } = {}) {
      const list = await this.list();
      const sorted = [...list].sort((a, b) => {
        let valA = a[sortBy] ?? "";
        let valB = b[sortBy] ?? "";
        if (sortBy === "rating") {
          valA = a.rating || 0;
          valB = b.rating || 0;
        } else {
          if (typeof valA === "string") valA = valA.toLowerCase();
          if (typeof valB === "string") valB = valB.toLowerCase();
        }
        if (order === "asc") return valA < valB ? -1 : valA > valB ? 1 : 0;
        return valA > valB ? -1 : valA < valB ? 1 : 0;
      });
      const orderedIds = sorted.map((b) => b.id);
      await this.reorderBookmarks(orderedIds);
    },
  };

  return api;
}
