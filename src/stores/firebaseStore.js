// Firebase implementation conforming to the common store interface
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, collection, doc, onSnapshot, addDoc, setDoc, deleteDoc, writeBatch, query, getDocs, orderBy } from 'firebase/firestore';

export function createFirebaseStore({ firebaseConfig, appId, initialAuthToken }) {
  let listeners = new Set();
  let unsubSnapshot = null;
  let db = null;
  let auth = null;
  let userId = null;

  const notify = (all) => listeners.forEach((cb) => cb(all));

  const collectionRef = () => collection(db, 'artifacts', appId, 'users', userId, 'bookmarks');

  const api = {
    async init() {
      if (!firebaseConfig) throw new Error('firebaseConfig required');
      const app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);
      await new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, async (user) => {
          if (user) {
            userId = user.uid;
            unsub();
            resolve();
          } else {
            try {
              if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
              else await signInAnonymously(auth);
            } catch (e) {
              // retry or resolve anyway
              resolve();
            }
          }
        });
      });
      // PERF-04: Enable offline persistence so the app works without network on startup.
      // Requires composite index: position ASC, title ASC (see src/stores/FIREBASE_SETUP.md).
      try {
        await enableIndexedDbPersistence(db);
      } catch (e) {
        if (e.code === 'failed-precondition') {
          // Multiple tabs open — persistence only works in one tab at a time.
          console.warn('Firestore offline persistence unavailable: multiple tabs open.');
        } else if (e.code === 'unimplemented') {
          // Browser does not support IndexedDB.
          console.warn('Firestore offline persistence unavailable: browser unsupported.');
        }
      }
      // PERF-04: Subscribe to changes with error handler to detect auth/rules failures
      unsubSnapshot = onSnapshot(
        query(collectionRef(), orderBy('position', 'asc'), orderBy('title', 'asc')),
        (snapshot) => {
          const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          notify(all);
        },
        (error) => {
          // PERF-04: Handle subscription errors (e.g., expired auth token, changed rules)
          console.error('Firestore snapshot subscription error:', error);
          notify([]);
        }
      );
    },
    async list() {
      const snap = await getDocs(query(collectionRef(), orderBy('position', 'asc'), orderBy('title', 'asc')));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async create(bookmark) {
      const ref = await addDoc(collectionRef(), { ...bookmark, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
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
      const batch = writeBatch(db);
      ids.forEach((id) => {
        const ref = doc(collectionRef(), id);
        batch.delete(ref);
      });
      await batch.commit();
    },
    async bulkReplace(bookmarks) {
      const batch = writeBatch(db);
      const snap = await getDocs(query(collectionRef()));
      snap.forEach(d => batch.delete(d.ref));
      bookmarks.forEach((b, index) => {
        const dref = doc(collectionRef());
        batch.set(dref, { ...b, id: dref.id, position: typeof b.position === 'number' ? b.position : index, createdAt: b.createdAt || new Date().toISOString(), updatedAt: b.updatedAt || new Date().toISOString() });
      });
      await batch.commit();
    },
    async bulkAdd(bookmarks) {
      const batch = writeBatch(db);
      // Determine starting position by getting max position, or just append. 
      // Simplest for now is just append without enforcing strict position continuity, 
      // as reorder handles full list. But let's try to be nice if possible.
      // Actually, bulkReplace resets positions. bulkAdd might just append.
      // Let's just add them.
      const added = [];
      bookmarks.forEach((b) => {
        const dref = doc(collectionRef());
        const data = { ...b, id: dref.id, createdAt: b.createdAt || new Date().toISOString(), updatedAt: b.updatedAt || new Date().toISOString() };
        // If position is needed we could fetch current count, but batch is atomic. 
        // We'll leave position undefined or 0, effectively appending in default sort if we sort by position.
        // The list query sorts by position then title.
        batch.set(dref, data);
        added.push(data);
      });
      await batch.commit();
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
      const batch = writeBatch(db);
      normalized.forEach((id, idx) => {
        const ref = doc(collectionRef(), id);
        batch.set(ref, { position: idx, updatedAt: new Date().toISOString() }, { merge: true });
      });
      await batch.commit();
    },
    /**
     * Compute a sorted order by field and persist via positions.
     */
    async persistSortedOrder({ sortBy = 'title', order = 'asc' } = {}) {
      const list = await this.list();
      const sorted = [...list].sort((a, b) => {
        let valA = a[sortBy] ?? '';
        let valB = b[sortBy] ?? '';
        if (sortBy === 'rating') {
          valA = a.rating || 0;
          valB = b.rating || 0;
        } else {
          if (typeof valA === 'string') valA = valA.toLowerCase();
          if (typeof valB === 'string') valB = valB.toLowerCase();
        }
        if (order === 'asc') return valA < valB ? -1 : valA > valB ? 1 : 0;
        return valA > valB ? -1 : valA < valB ? 1 : 0;
      });
      const orderedIds = sorted.map((b) => b.id);
      await this.reorderBookmarks(orderedIds);
    }
  };

  return api;
}
