import React, { useMemo, useState } from "react";

import { Button, Modal, Tag } from "./DesignSystem.jsx";

// #44: The diff a tidy-up is reviewed through.
//
// A model proposing changes to a hundred bookmarks is only useful if disagreeing
// with it is cheap, so every row starts accepted, every row can be dropped on its
// own, and nothing is written until Apply. The modal owns which rows are accepted
// and nothing else: the rows were computed by utils/organizePlan.js and applying
// them is the caller's business.

const FIELD_LABELS = { tags: "Tags", folderId: "Folder", description: "Description" };

const TagList = ({ tags, added = [] }) => {
  const isNew = new Set(added.map((tag) => tag.toLowerCase()));
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.length === 0 && <span className="text-secondary-text">none</span>}
      {tags.map((tag) => (
        <Tag key={tag} onAccent={isNew.has(tag.toLowerCase())}>
          {tag}
        </Tag>
      ))}
    </span>
  );
};

const FieldDiff = ({ field, before, after }) => {
  if (field === "tags") {
    const gained = (after.tags || []).filter(
      (tag) => !(before.tags || []).some((had) => had.toLowerCase() === tag.toLowerCase())
    );
    return <TagList tags={after.tags || []} added={gained} />;
  }
  if (field === "folderId") {
    return (
      <span>
        <span className="text-secondary-text line-through">{before.folderId || "no folder"}</span>{" "}
        <span aria-hidden="true">→</span>{" "}
        <span className="text-primary-text">{after.folderId}</span>
      </span>
    );
  }
  return <span className="text-primary-text">{after.description}</span>;
};

const OrganizeReviewModal = ({ rows = [], onApply, onCancel, isApplying = false }) => {
  const [rejected, setRejected] = useState(() => new Set());

  const accepted = useMemo(
    () => rows.filter((row) => !rejected.has(row.id)).map((row) => row.id),
    [rows, rejected]
  );

  const toggle = (id) =>
    setRejected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allAccepted = accepted.length === rows.length;

  return (
    <Modal
      title="Review the proposed changes"
      size="lg"
      onClose={onCancel}
      closeDisabled={isApplying}
      onScrimClick={() => !isApplying && onCancel()}
      footer={
        <>
          <Button intent="secondary" onClick={onCancel} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            intent="primary"
            onClick={() => onApply(accepted)}
            disabled={accepted.length === 0}
            loading={isApplying}
          >
            {isApplying
              ? "Applying…"
              : `Apply ${accepted.length} change${accepted.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-secondary-text text-sm">
          {rows.length} bookmark{rows.length === 1 ? "" : "s"} would change. Untick anything you
          disagree with.
        </p>
        <Button
          intent="ghost"
          size="sm"
          onClick={() => setRejected(allAccepted ? new Set(rows.map((row) => row.id)) : new Set())}
        >
          {allAccepted ? "Deselect all" : "Select all"}
        </Button>
      </div>

      <ul className="max-h-96 overflow-y-auto space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="p-2 rounded border border-border">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={!rejected.has(row.id)}
                onChange={() => toggle(row.id)}
                disabled={isApplying}
              />
              <span className="min-w-0">
                <span className="block text-primary-text truncate">{row.title}</span>
                {row.fields.map((field) => (
                  <span key={field} className="block text-sm mt-0.5">
                    <span className="text-secondary-text">{FIELD_LABELS[field]}: </span>
                    <FieldDiff field={field} before={row.before} after={row.after} />
                  </span>
                ))}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
};

export default React.memo(OrganizeReviewModal);
