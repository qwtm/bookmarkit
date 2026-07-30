// Common store interface and factory
// Interface methods:
// - init(): Promise<void> | void
// - list(): Promise<Bookmark[]>
// - subscribe(callback: (bookmarks: Bookmark[]) => void): () => void
// - teardown(): void — release every backend listener init() registered
// - create(bookmark): Promise<Bookmark>
// - update(id, patch): Promise<void>
// - updateMany(patches: {id, ...patch}[]): Promise<void> (optional; one round-trip
//   for a whole selection. Callers fall back to update() per bookmark.)
// - remove(id): Promise<void>
// - bulkReplace(bookmarks): Promise<void>
// - reorderBookmarks(orderedIds: string[]): Promise<void> (optional)
// - persistSortedOrder({ sortBy: string, order: 'asc'|'desc' }): Promise<void> (optional)

export const STORE_TYPES = {
  CHROME: "chrome",
  FIREBASE: "firebase",
  LOCAL: "local",
};

export async function getStore(type = STORE_TYPES.CHROME, options = {}) {
  if (type === STORE_TYPES.LOCAL) {
    const mod = await import("./localCompositeStore.js");
    return mod.createLocalCompositeStore(options);
  }
  if (type === STORE_TYPES.FIREBASE) {
    const mod = await import("./firebaseStore.js");
    return mod.createFirebaseStore(options);
  }
  const mod = await import("./chromeBookmarksStore.js");
  return mod.createChromeBookmarksStore(options);
}
