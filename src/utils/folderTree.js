// #55: What a folder is, given that no folder exists.
//
// `folderId` is a path string on a bookmark and nothing else — there is no folder
// record anywhere, in any store. Every folder in the app is therefore derived: it
// exists because some bookmark says it does, it holds what points at it, and it
// disappears when the last of them leaves. That is why renaming a folder is a
// write across bookmarks rather than a rename, and why deleting one has to say
// what happens to its contents.
//
// All of it is pure, and all of it returns patches for the ordinary bulk-edit path
// (#54), so moving thirty bookmarks between folders is one store write and one
// undo entry rather than thirty of each.
//
// Paths are compared case-insensitively. `Work` and `work` are the same folder
// here, because a tree that showed two of them would give each half the count and
// filtering either would show the other's bookmarks.

export const FOLDER_SEPARATOR = "/";

/** The filter value for "bookmarks in no folder at all", which is not a path. */
export const UNFILED = "\u0000unfiled";

/** A path as its parts, with the blanks and stray whitespace that a typed path collects removed. */
export const folderSegments = (value) =>
  String(value ?? "")
    .split(FOLDER_SEPARATOR)
    .map((segment) => segment.replace(/\s+/gu, " ").trim())
    .filter(Boolean);

export const asFolderPath = (segments = []) => segments.join(FOLDER_SEPARATOR);

export const normalizeFolderPath = (value) => asFolderPath(folderSegments(value));

/** The folder this one sits in, or `""` for a top-level folder. */
export const parentFolder = (path) => asFolderPath(folderSegments(path).slice(0, -1));

/** The last segment — what the tree shows, as opposed to the whole path. */
export const folderName = (path) => folderSegments(path).at(-1) ?? "";

/**
 * Whether `path` is `folder` or something inside it.
 *
 * Segment-wise rather than by string prefix, so `Work/Project` is not inside
 * `Wor`. An empty `folder` is the root and contains everything.
 */
export function isWithinFolder(path, folder) {
  const target = folderSegments(folder);
  if (target.length === 0) return true;
  const segments = folderSegments(path);
  if (segments.length < target.length) return false;
  return target.every((segment, i) => segment.toLowerCase() === segments[i].toLowerCase());
}

const sortNodes = (nodes) =>
  [...nodes.values()]
    .map((node) => ({ ...node, children: sortNodes(node.children) }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** The child node for one segment, creating it the first time that segment is seen. */
function childFor(level, segment, parentPath) {
  const key = segment.toLowerCase();
  const existing = level.get(key);
  if (existing) return existing;
  const node = {
    path: parentPath ? `${parentPath}${FOLDER_SEPARATOR}${segment}` : segment,
    name: segment,
    count: 0,
    total: 0,
    children: new Map(),
  };
  level.set(key, node);
  return node;
}

/**
 * The folder tree the collection implies.
 *
 * A folder counts what is directly in it (`count`) and what is anywhere beneath it
 * (`total`), because a collapsed `Work` showing 0 while holding sixty bookmarks in
 * subfolders is the tree lying about itself.
 *
 * @param {object[]} bookmarks
 * @returns {{folders: object[], unfiled: number, total: number}}
 */
export function buildFolderTree(bookmarks = []) {
  const roots = new Map();
  let unfiled = 0;

  for (const bookmark of bookmarks) {
    const segments = folderSegments(bookmark?.folderId);
    if (segments.length === 0) {
      unfiled += 1;
      continue;
    }
    let level = roots;
    let node = null;
    for (const segment of segments) {
      node = childFor(level, segment, node?.path ?? "");
      node.total += 1;
      level = node.children;
    }
    node.count += 1;
  }

  return { folders: sortNodes(roots), unfiled, total: bookmarks.length };
}

/** Every folder path in use, ancestors included, for a picker or an autocomplete. */
export function folderPaths(bookmarks = []) {
  const collect = (nodes) => nodes.flatMap((node) => [node.path, ...collect(node.children)]);
  return collect(buildFolderTree(bookmarks).folders).sort((a, b) => a.localeCompare(b));
}

/**
 * The bookmarks in a folder, subfolders included — clicking `Work` shows what is
 * in `Work/Project A` too, which is what a tree implies.
 *
 * @param {string} folder A path, `UNFILED`, or `""` for everything.
 */
export function findInFolder(folder, list = []) {
  if (folder === UNFILED) return list.filter((b) => folderSegments(b?.folderId).length === 0);
  if (!folder) return list;
  return list.filter((b) => isWithinFolder(b?.folderId, folder));
}

/** Patches moving the named bookmarks into a folder, skipping those already there. */
export function moveToFolderPatches(list = [], ids = [], folder = "") {
  const wanted = new Set(ids);
  const path = folder === UNFILED ? "" : normalizeFolderPath(folder);
  return list
    .filter((b) => wanted.has(b?.id) && (b.folderId || "") !== path)
    .map((b) => ({ id: b.id, folderId: path }));
}

/**
 * Patches renaming a folder, taking its subfolders and their bookmarks with it.
 *
 * Moving a folder is the same write: dropping `Work` onto `Archive` renames it to
 * `Archive/Work`. An empty `to` moves the contents out to the root.
 *
 * Refuses to move a folder into itself — `Work` into `Work/Project` would rename
 * the destination out from under the move — and refuses to rename the root, which
 * is not a folder anyone can name.
 */
export function renameFolderPatches(list = [], from, to) {
  const source = folderSegments(from);
  if (source.length === 0) return [];
  const target = folderSegments(to);
  const destination = asFolderPath(target);
  if (destination.toLowerCase() === asFolderPath(source).toLowerCase()) return [];
  if (isWithinFolder(destination, asFolderPath(source))) return [];

  const patches = [];
  for (const bookmark of list) {
    if (!bookmark?.id || !isWithinFolder(bookmark.folderId, asFolderPath(source))) continue;
    const rest = folderSegments(bookmark.folderId).slice(source.length);
    const folderId = asFolderPath([...target, ...rest]);
    if (folderId !== (bookmark.folderId || "")) patches.push({ id: bookmark.id, folderId });
  }
  return patches;
}

/**
 * Patches removing a folder by emptying it upwards: its bookmarks and subfolders
 * move into its parent.
 *
 * Deleting the bookmarks instead would make dragging one into the wrong folder a
 * data-loss risk, and there is no folder to delete on its own — a folder with
 * nothing pointing at it has already ceased to exist.
 */
export const dissolveFolderPatches = (list = [], path) =>
  renameFolderPatches(list, path, parentFolder(path));
