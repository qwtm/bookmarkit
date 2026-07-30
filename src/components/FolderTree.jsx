// #55: The folders, as somewhere to stand.
//
// Until now a folder could only be typed into a text field, so browsing meant
// remembering. This shows the tree the collection already implies (utils/folderTree.js
// derives it), filters by a click, and accepts a drop.
//
// It decides nothing about what a move means. Every gesture here hands paths and
// ids to the caller, which applies them through the same bulk-edit write as the
// bar does — so dragging thirty bookmarks is one undo entry, and this file has no
// idea a store exists.

import React, { useMemo, useState } from "react";
import { keepsSelectionProps } from "../hooks/useBookmarkSelection.js";
import { UNFILED, buildFolderTree, folderName, parentFolder } from "../utils/folderTree.js";
import { Button, IconButton, Input } from "./DesignSystem.jsx";

/** What a drag is carrying. Two kinds, because a folder drop renests and a bookmark drop moves. */
export const DRAG_BOOKMARKS = "application/x-bookmarkit-bookmarks";
export const DRAG_FOLDER = "application/x-bookmarkit-folder";

/** The ids a drag is carrying, or `[]` when it is carrying something else. */
const draggedIds = (event) => {
  try {
    const raw = event.dataTransfer?.getData(DRAG_BOOKMARKS);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
};

const Row = ({ depth = 0, active, children, ...props }) => (
  <div
    className={`flex items-center gap-1 rounded px-1 py-0.5 text-sm ${
      active ? "bg-accent text-white" : "text-primary-text hover:bg-secondary-bg"
    }`}
    style={{ paddingLeft: `${depth * 0.75 + 0.25}rem` }}
    {...props}
  >
    {children}
  </div>
);

const Count = ({ node, active }) => (
  <span className={`text-xs ${active ? "text-white" : "text-secondary-text"}`}>
    {node.total}
    {node.total !== node.count && <span title={`${node.count} directly in this folder`}>*</span>}
  </span>
);

/**
 * One folder and everything under it. Renaming is inline: the row becomes the
 * field, so the tree keeps its place instead of a dialog taking over.
 */
function FolderNode({ node, depth, activeFolder, collapsed, onToggle, actions }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dropping, setDropping] = useState(false);
  const isCollapsed = collapsed.has(node.path.toLowerCase());
  const active = activeFolder === node.path;

  const rename = () => {
    const name = draft.trim();
    setRenaming(false);
    if (!name || name === node.name) return;
    actions.onRename(node.path, name);
  };

  const drop = (event) => {
    event.preventDefault();
    setDropping(false);
    actions.onDropInto(event, node.path);
  };

  if (renaming) {
    return (
      <li>
        <Row depth={depth}>
          <Input
            id={`folder-rename-${node.path}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={rename}
            onKeyDown={(event) => {
              if (event.key === "Enter") rename();
              if (event.key === "Escape") setRenaming(false);
            }}
            aria-label={`Rename ${node.path}`}
            wrapperClassName="flex-1"
            autoFocus
          />
        </Row>
      </li>
    );
  }

  return (
    <li>
      <Row
        depth={depth}
        active={active || dropping}
        onDragOver={(event) => {
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={drop}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(node.path)}
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.name}`}
            aria-expanded={!isCollapsed}
            className="w-4 shrink-0 text-xs"
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          draggable
          onDragStart={(event) => event.dataTransfer?.setData(DRAG_FOLDER, node.path)}
          onClick={() => actions.onSelect(active ? "" : node.path)}
          aria-pressed={active}
          className="flex-1 min-w-0 text-left truncate"
          title={node.path}
        >
          {node.name}
        </button>

        <Count node={node} active={active || dropping} />

        <IconButton
          label={`Rename ${node.path}`}
          size="sm"
          onClick={() => {
            setDraft(node.name);
            setRenaming(true);
          }}
        >
          ✎
        </IconButton>
        <IconButton
          label={`Remove folder ${node.path}`}
          size="sm"
          onClick={() => setConfirmingDelete(true)}
        >
          ✕
        </IconButton>
      </Row>

      {/* Deleting a folder never deletes bookmarks, so the offer has to say where they go. */}
      {confirmingDelete && (
        <div className="ml-6 my-1 text-xs text-secondary-text">
          <p className="mb-1">
            Move {node.total} bookmark{node.total === 1 ? "" : "s"} to{" "}
            {parentFolder(node.path) || "no folder"} and remove this folder?
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConfirmingDelete(false);
                actions.onDelete(node.path);
              }}
            >
              Remove
            </Button>
            <Button
              type="button"
              intent="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
            >
              Keep
            </Button>
          </div>
        </div>
      )}

      {!isCollapsed && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <FolderNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFolder={activeFolder}
              collapsed={collapsed}
              onToggle={onToggle}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const FolderTree = React.memo(function FolderTree({
  bookmarks = [],
  activeFolder = "",
  onSelect,
  onMoveBookmarks,
  onMoveFolder,
  onRenameFolder,
  onDeleteFolder,
  className = "",
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const { folders, unfiled, total } = useMemo(() => buildFolderTree(bookmarks), [bookmarks]);

  const onToggle = (path) =>
    setCollapsed((current) => {
      const next = new Set(current);
      const key = path.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // A drop is one of two things, and both are told as full paths — the callers
  // apply patches and never have to know how a path is put together. `into` is
  // the destination folder, `""` being the root.
  const onDropInto = (event, into) => {
    const ids = draggedIds(event);
    if (ids.length > 0) {
      onMoveBookmarks(ids, into === "" ? UNFILED : into);
      return;
    }
    const dragged = event.dataTransfer?.getData(DRAG_FOLDER);
    if (!dragged) return;
    const name = folderName(dragged);
    onMoveFolder(dragged, into ? `${into}/${name}` : name);
  };

  // Renaming keeps a folder where it is, so what the caller gets is the same path
  // with its last segment replaced.
  const actions = {
    onSelect,
    onDropInto,
    onRename: (path, name) => {
      const parent = parentFolder(path);
      onRenameFolder(path, parent ? `${parent}/${name}` : name);
    },
    onDelete: onDeleteFolder,
  };

  const dropOnRoot = (event) => {
    event.preventDefault();
    onDropInto(event, "");
  };

  return (
    // Clicking a folder must not dismiss the selection a drop is about to move.
    <nav className={`overflow-y-auto ${className}`} aria-label="Folders" {...keepsSelectionProps}>
      <ul>
        <li onDragOver={(event) => event.preventDefault()} onDrop={dropOnRoot}>
          <Row active={activeFolder === ""}>
            <span className="w-4 shrink-0" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onSelect("")}
              aria-pressed={activeFolder === ""}
              className="flex-1 min-w-0 text-left truncate"
            >
              All bookmarks
            </button>
            <span
              className={`text-xs ${activeFolder === "" ? "text-white" : "text-secondary-text"}`}
            >
              {total}
            </span>
          </Row>
        </li>

        {folders.map((node) => (
          <FolderNode
            key={node.path}
            node={node}
            depth={0}
            activeFolder={activeFolder}
            collapsed={collapsed}
            onToggle={onToggle}
            actions={actions}
          />
        ))}

        {unfiled > 0 && (
          <li onDragOver={(event) => event.preventDefault()} onDrop={dropOnRoot}>
            <Row active={activeFolder === UNFILED}>
              <span className="w-4 shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onSelect(activeFolder === UNFILED ? "" : UNFILED)}
                aria-pressed={activeFolder === UNFILED}
                className="flex-1 min-w-0 text-left truncate"
              >
                No folder
              </button>
              <span
                className={`text-xs ${
                  activeFolder === UNFILED ? "text-white" : "text-secondary-text"
                }`}
              >
                {unfiled}
              </span>
            </Row>
          </li>
        )}
      </ul>
    </nav>
  );
});

export default FolderTree;
