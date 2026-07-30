// #54: What to do with a selection, once there is more than one thing in it.
//
// Multi-select could only delete, so retagging forty bookmarks meant opening the
// form forty times. This collects a change; `utils/bulkEdit.js` decides what it
// would write and the store applies it in one go.
//
// The confirmation is inline rather than a dialog: it is the same bar, one step
// on, which keeps the selection visible behind it and keeps this component out of
// the app's dialog stack.

import React, { useMemo, useState } from "react";
import { describeBulkEdit, isEmptyChange, planBulkEdit } from "../utils/bulkEdit.js";
import { Button, Input, Select } from "./DesignSystem.jsx";

// Above this many bookmarks, applying takes a second press. Small enough that a
// slip on a big selection is caught, large enough not to nag.
const CONFIRM_ABOVE = 10;

// "Leave this field alone" has to be distinguishable from "set it to empty",
// since no folder and no rating are both things a bulk edit can mean.
const KEEP = "";
const ROOT = "\u0000root";
const NEW_FOLDER = "\u0000new";

const EMPTY = { addTags: "", removeTags: "", folder: KEEP, newFolder: "", rating: KEEP };

/** Folders already in use, so moving into one is a choice rather than a spelling test. */
const folderOptions = (bookmarks) =>
  [...new Set(bookmarks.map((b) => b?.folderId).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

/**
 * The change as `planBulkEdit` wants it: a field left alone is absent rather than
 * present and empty.
 */
function asChange({ addTags, removeTags, folder, newFolder, rating }) {
  const change = { addTags, removeTags };
  if (folder === ROOT) change.folderId = "";
  else if (folder === NEW_FOLDER) {
    const path = newFolder.trim();
    if (path) change.folderId = path;
  } else if (folder !== KEEP) change.folderId = folder;
  if (rating !== KEEP) change.rating = Number(rating);
  return change;
}

const BulkEditBar = React.memo(function BulkEditBar({
  selected,
  allBookmarks = [],
  onApply,
  onClearSelection,
  onDelete,
}) {
  const [form, setForm] = useState(EMPTY);
  const [confirming, setConfirming] = useState(false);

  const change = useMemo(() => asChange(form), [form]);
  const { patches, unchanged } = useMemo(() => planBulkEdit(selected, change), [selected, change]);
  const nothingToDo = patches.length === 0;

  // Any edit to the form withdraws a pending confirmation: the number that was
  // being confirmed is no longer the number that would be written.
  const set = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
    setConfirming(false);
  };

  const apply = async () => {
    if (nothingToDo) return;
    if (patches.length > CONFIRM_ABOVE && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    await onApply(patches);
    setForm(EMPTY);
  };

  const count = selected.length;
  const folders = folderOptions(allBookmarks);

  return (
    <div
      className="mb-4 p-3 rounded-lg border border-accent bg-primary-bg"
      role="group"
      aria-label={`Bulk edit ${count} selected bookmark${count === 1 ? "" : "s"}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-primary-text">{count} selected</span>

        <Input
          id="bulk-add-tags"
          type="text"
          value={form.addTags}
          onChange={set("addTags")}
          placeholder="Add tags…"
          aria-label="Tags to add, comma separated"
          wrapperClassName="w-[11.25rem]"
        />

        <Input
          id="bulk-remove-tags"
          type="text"
          value={form.removeTags}
          onChange={set("removeTags")}
          placeholder="Remove tags…"
          aria-label="Tags to remove, comma separated"
          wrapperClassName="w-[11.25rem]"
        />

        <Select
          id="bulk-folder"
          value={form.folder}
          onChange={set("folder")}
          aria-label="Folder to move the selection into"
          wrapperClassName="w-[11.25rem]"
          options={[
            { value: KEEP, label: "Keep folders" },
            { value: ROOT, label: "No folder" },
            ...folders.map((folder) => ({ value: folder, label: folder })),
            { value: NEW_FOLDER, label: "New folder…" },
          ]}
        />

        {form.folder === NEW_FOLDER && (
          <Input
            id="bulk-new-folder"
            type="text"
            value={form.newFolder}
            onChange={set("newFolder")}
            placeholder="Folder path…"
            aria-label="New folder path"
            wrapperClassName="w-[11.25rem]"
            autoFocus
          />
        )}

        <Select
          id="bulk-rating"
          value={form.rating}
          onChange={set("rating")}
          aria-label="Rating to set"
          wrapperClassName="w-[9.375rem]"
          options={[
            { value: KEEP, label: "Keep ratings" },
            { value: 0, label: "Clear rating" },
            ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: "★".repeat(n) })),
          ]}
        />

        <Button type="button" onClick={apply} disabled={nothingToDo}>
          {confirming ? `Apply to ${patches.length}?` : "Apply"}
        </Button>

        {onDelete && (
          <Button type="button" intent="secondary" onClick={onDelete}>
            Delete
          </Button>
        )}

        <Button type="button" intent="ghost" onClick={onClearSelection}>
          Clear selection
        </Button>
      </div>

      {/* Says what would happen before it happens, and stays quiet when nothing would. */}
      <div className="mt-2 text-xs text-secondary-text" aria-live="polite">
        {isEmptyChange(change)
          ? "Tags are added and removed, not replaced."
          : nothingToDo
            ? `Nothing to change — all ${count} already match.`
            : `${describeBulkEdit(change, patches.length)}${
                unchanged > 0 ? ` (${unchanged} already match)` : ""
              }`}
      </div>
    </div>
  );
});

export default BulkEditBar;
