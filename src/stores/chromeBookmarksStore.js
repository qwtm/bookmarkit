// Chrome Bookmarks API implementation
// Requires "bookmarks" permission in the manifest

const ROOT_FOLDER_TITLE = "bookmarkit";

// #14: Chrome reports one event per touched node, so a change made elsewhere
// (the bookmark manager, another extension) arrives as a burst. Coalesce the
// burst into a single tree walk. Mirrors the debounce in localCompositeStore.
const EXTERNAL_NOTIFY_DEBOUNCE_MS = 50;

export function createChromeBookmarksStore() {
  let listeners = new Set();
  let unsubscribeFns = [];
  // Depth of writes we are making ourselves. Every one of those writes notifies
  // once when it finishes, so the events Chrome echoes back while it is in
  // flight carry no information a listener does not already receive — and each
  // echo used to cost a full recursive tree walk, making an N-item import O(N²).
  let mutationDepth = 0;
  let notifyTimer = null;

  const notify = async () => {
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    const all = await api.list();
    listeners.forEach((cb) => cb(all));
  };

  const scheduleNotify = () => {
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      notify();
    }, EXTERNAL_NOTIFY_DEBOUNCE_MS);
  };

  /**
   * Run one of our own writes, then notify subscribers exactly once. Nested
   * calls (persistSortedOrder → reorderBookmarks) collapse into the outermost
   * notify. A write that throws may still have changed part of the tree, so it
   * falls back to the coalesced notify rather than leaving listeners stale.
   */
  const mutate = async (write) => {
    mutationDepth += 1;
    try {
      const result = await write();
      if (mutationDepth === 1) await notify();
      return result;
    } catch (error) {
      if (mutationDepth === 1) scheduleNotify();
      throw error;
    } finally {
      mutationDepth -= 1;
    }
  };

  const ensureRootFolder = async () => {
    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0].children.find((n) => n.id === "1" || n.title === "Bookmarks bar");
    const existing = (bar.children || []).find(
      (n) => n.title === ROOT_FOLDER_TITLE && n.url === undefined
    );
    if (existing) return existing.id;
    const created = await chrome.bookmarks.create({
      parentId: bar.id,
      title: ROOT_FOLDER_TITLE,
    });
    return created.id;
  };

  /**
   * Ensure a nested folder path exists under the root (e.g., "Work/Project A"),
   * returning the deepest folder id and the folders that had to be created.
   *
   * #17: a caller that may have to undo its write needs to know which folders
   * were its own doing. An empty folder that was already there belongs to the
   * user and must survive a rollback.
   */
  const openFolderPath = async (path) => {
    const rootId = await ensureRootFolder();
    const clean = (path || "").trim();
    if (!clean) return { id: rootId, created: [] };
    const segments = clean
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    const created = [];
    let parentId = rootId;
    for (const seg of segments) {
      const children = await chrome.bookmarks.getChildren(parentId);
      let folder = (children || []).find((n) => !n.url && n.title === seg);
      if (!folder) {
        folder = await chrome.bookmarks.create({ parentId, title: seg });
        created.push({ id: folder.id, parentId });
      }
      parentId = folder.id;
    }
    return { id: parentId, created };
  };

  const ensureFolderPath = async (path) => (await openFolderPath(path)).id;

  // Convert a chrome bookmark node to our Bookmark shape. folderPath is the path under ROOT ('' when at root)
  const toBookmark = (n, folderPath = "") => ({
    id: n.id,
    title: n.title || n.url || "Untitled",
    url: n.url || "",
    description: "",
    tags: [],
    rating: 0,
    folderId: folderPath || "",
    // #39: Left empty on purpose. A Chrome bookmark carries no icon, and minting
    // a third-party favicon URL here would make every list render report the
    // user's hostnames. src/utils/favicon.js owns that decision instead.
    faviconUrl: "",
    createdAt: "",
    updatedAt: "",
    urlStatus: "valid",
  });

  /**
   * One recursive read of everything under the root, in the two views callers
   * need: each bookmark node with the folder path it sits in, and each folder
   * with its parent — #17 has to tidy up folders a write emptied, and emptying
   * a folder can empty the one above it.
   */
  const readCollection = async () => {
    const rootId = await ensureRootFolder();
    const bookmarks = [];
    const parentOf = new Map();
    // PERF-02: Parallelize sibling folder traversal using Promise.all at each level
    const traverse = async (parentId, pathParts) => {
      const children = await chrome.bookmarks.getChildren(parentId);
      const folderPromises = [];
      for (const child of children) {
        if (child.url) {
          bookmarks.push({ node: child, folderPath: pathParts.join("/") });
        } else {
          parentOf.set(child.id, parentId);
          folderPromises.push(traverse(child.id, [...pathParts, child.title || ""]));
        }
      }
      await Promise.all(folderPromises);
    };
    await traverse(rootId, []);
    return { bookmarks, parentOf };
  };

  // Recursively list all bookmarks under the root and include their folder path (relative to ROOT)
  const listUnderRoot = async () => {
    const { bookmarks } = await readCollection();
    return bookmarks.map(({ node, folderPath }) => toBookmark(node, folderPath));
  };

  // #42: the folder path a bookmark asks for, in the same shape `create` uses.
  const folderPathOf = (bookmark) =>
    typeof bookmark.folderId === "string" ? bookmark.folderId.trim() : "";

  /**
   * #42: Create many bookmarks in the folders their folderId names, rather than
   * flattening them under the root — an HTML import derives folders from its
   * <H3> tags and the Chrome tree is what other devices see.
   *
   * Each distinct path is resolved once, sequentially, so two bookmarks under
   * "Work/A" and "Work/B" share one "Work" folder instead of racing to create
   * two. Creation itself stays parallel (PERF-02).
   *
   * Returns successes and failures instead of throwing, so a caller that has
   * something to lose can decide what a partial result means.
   */
  const createInFolders = async (bookmarks) => {
    const folderIds = new Map();
    const newFolders = [];
    for (const path of new Set(bookmarks.map(folderPathOf))) {
      const { id, created } = await openFolderPath(path);
      folderIds.set(path, id);
      newFolders.push(...created);
    }
    const settled = await Promise.allSettled(
      bookmarks.map((b) =>
        chrome.bookmarks.create({
          parentId: folderIds.get(folderPathOf(b)),
          title: b.title || b.url,
          url: b.url,
        })
      )
    );
    return {
      created: settled.filter((r) => r.status === "fulfilled").map((r) => r.value),
      failures: settled.filter((r) => r.status === "rejected").map((r) => r.reason),
      newFolders,
    };
  };

  const removeQuietly = (ids) =>
    Promise.all(ids.map((id) => chrome.bookmarks.remove(id).catch(() => {})));

  /**
   * #17: Remove the named folders that hold nothing, and any parent they empty.
   *
   * A folder here exists to hold bookmarks, so one left empty by a write is a
   * shell: the remains of a replaced collection, or of a replacement that never
   * landed. Only the ids passed in are candidates — an empty folder the user
   * made themselves is not this function's business. Removing one requeues its
   * parent, so order among the candidates does not matter.
   */
  const pruneEmptyFolders = async (candidates, parentOf) => {
    const rootId = await ensureRootFolder();
    const queue = [...candidates];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || id === rootId) continue;
      try {
        const children = await chrome.bookmarks.getChildren(id);
        if (children.length > 0) continue;
        await chrome.bookmarks.remove(id);
      } catch {
        continue; // already gone, or Chrome refused — either way, leave it
      }
      queue.push(parentOf.get(id));
    }
  };

  const pruneFoldersCreatedBy = (newFolders) =>
    pruneEmptyFolders(
      newFolders.map((f) => f.id),
      new Map(newFolders.map((f) => [f.id, f.parentId]))
    );

  const subscribeChromeEvents = () => {
    const onChange = () => {
      if (mutationDepth > 0) return;
      scheduleNotify();
    };
    chrome.bookmarks.onCreated.addListener(onChange);
    chrome.bookmarks.onRemoved.addListener(onChange);
    chrome.bookmarks.onChanged.addListener(onChange);
    chrome.bookmarks.onMoved.addListener(onChange);
    return () => {
      chrome.bookmarks.onCreated.removeListener(onChange);
      chrome.bookmarks.onRemoved.removeListener(onChange);
      chrome.bookmarks.onChanged.removeListener(onChange);
      chrome.bookmarks.onMoved.removeListener(onChange);
    };
  };

  const api = {
    async init() {
      unsubscribeFns.push(subscribeChromeEvents());
      await notify();
    },
    async list() {
      return listUnderRoot();
    },
    /**
     * Reorder children under the bookmarkit root to match the provided orderedIds.
     * Any children not included in orderedIds will be appended after the provided order,
     * preserving their relative order.
     */
    async reorderBookmarks(orderedIds = []) {
      await mutate(async () => {
        const rootId = await ensureRootFolder();
        const children = await chrome.bookmarks.getChildren(rootId);
        // Only bookmark nodes (exclude folders)
        const bookmarkChildren = children.filter((n) => n.url);
        const existingIds = bookmarkChildren.map((n) => n.id);
        const set = new Set(orderedIds);
        const normalized = [
          // Keep only ids that exist under root
          ...orderedIds.filter((id) => set.has(id) && existingIds.includes(id)),
          // Append the rest (not specified), preserving current order
          ...existingIds.filter((id) => !set.has(id)),
        ];
        // Sequentially move each node to its index
        for (let i = 0; i < normalized.length; i++) {
          const id = normalized[i];
          try {
            await chrome.bookmarks.move(id, { parentId: rootId, index: i });
          } catch (e) {
            // Ignore move errors for individual items to keep best-effort ordering
            console.warn("Failed to move bookmark", id, e);
          }
        }
      });
    },
    /**
     * Persist a sorted order by sortBy and order for all bookmarks under the root folder.
     */
    async persistSortedOrder({ sortBy = "title", order = "asc" } = {}) {
      const list = await listUnderRoot();
      const key = sortBy === "folder" ? "folderId" : sortBy;
      const sorted = [...list].sort((a, b) => {
        let valA = a[key] ?? "";
        let valB = b[key] ?? "";
        if (key === "rating") {
          valA = a.rating || 0;
          valB = b.rating || 0;
        } else if (key === "createdAt" || key === "updatedAt") {
          valA = a[key] ? new Date(a[key]).getTime() : 0;
          valB = b[key] ? new Date(b[key]).getTime() : 0;
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
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    // #19: Drop the chrome.bookmarks event listeners this store registered.
    // Without it a re-init (StrictMode double-mount, store switch) leaves the
    // previous listeners attached and firing into a discarded store.
    teardown() {
      unsubscribeFns.forEach((unsubscribe) => unsubscribe());
      unsubscribeFns = [];
      listeners.clear();
    },
    async create(bookmark) {
      const node = await mutate(async () => {
        const parentId = await ensureFolderPath(
          typeof bookmark.folderId === "string" ? bookmark.folderId : ""
        );
        return chrome.bookmarks.create({
          parentId,
          title: bookmark.title || bookmark.url,
          url: bookmark.url,
        });
      });
      // Compute path by walking up to root (optional) or reuse provided path for performance
      const folderPath =
        (typeof bookmark.folderId === "string" ? bookmark.folderId.trim() : "") || "";
      return toBookmark(node, folderPath);
    },
    async update(id, patch) {
      await mutate(async () => {
        const changes = {};
        if (patch.title) changes.title = patch.title;
        if (patch.url) changes.url = patch.url;
        if (Object.keys(changes).length > 0) {
          await chrome.bookmarks.update(id, changes);
        }
        // Handle moving to a folder when folderId (treated as a folder path label) is provided
        if (Object.prototype.hasOwnProperty.call(patch, "folderId")) {
          const folderPath = typeof patch.folderId === "string" ? patch.folderId.trim() : "";
          try {
            if (folderPath) {
              const parentId = await ensureFolderPath(folderPath);
              await chrome.bookmarks.move(id, { parentId });
            } else {
              // Empty string means move back to root
              const rootId = await ensureRootFolder();
              await chrome.bookmarks.move(id, { parentId: rootId });
            }
          } catch (e) {
            // Ignore move errors to avoid breaking update
            console.warn("Failed to move bookmark to folder path", folderPath, e);
          }
        }
      });
    },
    async remove(id) {
      await mutate(() => chrome.bookmarks.remove(id));
    },
    async removeMany(ids = []) {
      // Delete in parallel; ignore per-item failures, then notify once
      await mutate(() => removeQuietly(ids || []));
    },
    /**
     * #17: Replace the whole collection without a window in which it is gone.
     * The replacements are written first; the originals are removed only once
     * every one of them exists. A partial failure rolls the new copies back and
     * reports the error, leaving the collection as it was.
     *
     * #42: Folders are part of what gets replaced. The folders the old
     * bookmarks lived in go with them, so replacing "Archive/Old" with
     * "Fresh/New" does not leave an empty Archive behind for chrome://bookmarks
     * and every synced device to show.
     */
    async bulkReplace(bookmarks) {
      return mutate(async () => {
        const { bookmarks: previous, parentOf } = await readCollection();
        const { created, failures, newFolders } = await createInFolders(bookmarks);
        if (failures.length > 0) {
          await removeQuietly(created.map((n) => n.id));
          await pruneFoldersCreatedBy(newFolders);
          throw new Error(
            `Could not write ${failures.length} of ${bookmarks.length} bookmarks, so nothing was replaced: ${failures[0]?.message || failures[0]}`
          );
        }
        await removeQuietly(previous.map((b) => b.node.id));
        await pruneEmptyFolders(
          previous.map((b) => b.node.parentId),
          parentOf
        );
        return created;
      });
    },
    async bulkAdd(bookmarks) {
      const { created, failures } = await mutate(async () => {
        const result = await createInFolders(bookmarks);
        // A folder opened for a bookmark that never landed is a shell too.
        if (result.failures.length > 0) await pruneFoldersCreatedBy(result.newFolders);
        return result;
      });
      // Adding is additive, so the bookmarks that did land are kept, but the
      // caller still hears that the rest did not.
      if (failures.length > 0) throw failures[0];
      // No failures, so created[i] is the node for bookmarks[i].
      return created.map((n, i) => toBookmark(n, folderPathOf(bookmarks[i])));
    },
  };

  return api;
}
