// In-memory stand-in for the subset of chrome.bookmarks the stores use.
// Install it on globalThis.chrome so store factories can run under jsdom.

function createEvent() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    get listenerCount() {
      return listeners.size;
    },
    dispatch: (...args) => listeners.forEach((fn) => fn(...args)),
  };
}

/**
 * Build a fake chrome.bookmarks backed by a node map. The tree starts with the
 * synthetic root ("0") and a "Bookmarks bar" folder ("1"), matching the shape
 * `ensureRootFolder` looks for.
 */
export function createFakeChromeBookmarks() {
  let nextId = 100;
  const nodes = new Map();
  const children = new Map();

  const insert = (node, parentId, index) => {
    nodes.set(node.id, node);
    if (!children.has(node.id)) children.set(node.id, []);
    if (parentId === undefined) return node;
    const siblings = children.get(parentId);
    siblings.splice(index ?? siblings.length, 0, node.id);
    return node;
  };

  insert({ id: "0", title: "" });
  insert({ id: "1", title: "Bookmarks bar", parentId: "0" }, "0");

  const detach = (id) => {
    const siblings = children.get(nodes.get(id).parentId);
    const at = siblings.indexOf(id);
    if (at !== -1) siblings.splice(at, 1);
  };

  const hydrate = (id) => {
    const node = { ...nodes.get(id) };
    if (node.url === undefined) node.children = children.get(id).map(hydrate);
    return node;
  };

  const events = {
    onCreated: createEvent(),
    onRemoved: createEvent(),
    onChanged: createEvent(),
    onMoved: createEvent(),
  };

  const bookmarks = {
    ...events,
    async getTree() {
      return [hydrate("0")];
    },
    async getChildren(id) {
      return children.get(id).map((childId) => ({ ...nodes.get(childId) }));
    },
    async create({ parentId, title, url, index }) {
      if (!nodes.has(parentId)) throw new Error(`No parent with id ${parentId}`);
      const node = insert({ id: String(nextId++), parentId, title, url }, parentId, index);
      events.onCreated.dispatch(node.id, { ...node });
      return { ...node };
    },
    async remove(id) {
      if (!nodes.has(id)) throw new Error(`No bookmark with id ${id}`);
      detach(id);
      nodes.delete(id);
      children.delete(id);
      events.onRemoved.dispatch(id, {});
    },
    async update(id, changes) {
      const node = nodes.get(id);
      if (!node) throw new Error(`No bookmark with id ${id}`);
      Object.assign(node, changes);
      events.onChanged.dispatch(id, { ...changes });
      return { ...node };
    },
    async move(id, { parentId, index }) {
      const node = nodes.get(id);
      if (!node) throw new Error(`No bookmark with id ${id}`);
      detach(id);
      node.parentId = parentId ?? node.parentId;
      const siblings = children.get(node.parentId);
      siblings.splice(Math.min(index ?? siblings.length, siblings.length), 0, id);
      events.onMoved.dispatch(id, { parentId: node.parentId, index });
      return { ...node };
    },
  };

  return {
    bookmarks,
    /** Total listeners still registered across every bookmark event. */
    get listenerCount() {
      return Object.values(events).reduce((sum, event) => sum + event.listenerCount, 0);
    },
    /** Flat "path/title" list of every URL node, for asserting tree placement. */
    urlPaths() {
      const paths = [];
      const walk = (id, trail) => {
        for (const childId of children.get(id)) {
          const node = nodes.get(childId);
          if (node.url) paths.push([...trail, node.title].join("/"));
          else walk(childId, [...trail, node.title]);
        }
      };
      walk("1", []);
      return paths;
    },
    /** The same for folder nodes, so a test can see the shells a write left. */
    folderPaths() {
      const paths = [];
      const walk = (id, trail) => {
        for (const childId of children.get(id)) {
          const node = nodes.get(childId);
          if (node.url) continue;
          paths.push([...trail, node.title].join("/"));
          walk(childId, [...trail, node.title]);
        }
      };
      walk("1", []);
      return paths;
    },
  };
}

/** Install a fresh fake on globalThis.chrome and return it. */
export function installFakeChromeBookmarks() {
  const fake = createFakeChromeBookmarks();
  globalThis.chrome = { bookmarks: fake.bookmarks };
  return fake;
}
