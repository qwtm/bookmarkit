import React, { useMemo, useState } from "react";

import { Button, Modal, Tag } from "./DesignSystem.jsx";

// The diff a proposed change is reviewed through.
//
// Something proposing changes to a hundred bookmarks is only useful if disagreeing
// with it is cheap, so every row starts accepted, every row can be dropped on its
// own, and nothing is written until Apply. That holds whether the proposal came
// from a model tidying up (#44) or from an archive offering a copy of a dead link
// (#102), which is why this renders `utils/changeReview.js` rows and knows nothing
// about where they came from. It owns which rows are accepted and nothing else.

const FIELD_LABELS = {
  tags: "Tags",
  folderId: "Folder",
  description: "Description",
  url: "Address",
  urlStatus: "Link check",
  unreachable: "Old broken flag",
};

const WAS = { idle: "not checked", valid: "reachable", invalid: "broken", ignored: "not checked" };

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

const Replaced = ({ from, to }) => (
  <span className="break-all">
    <span className="text-secondary-text line-through">{from}</span>{" "}
    <span aria-hidden="true">→</span> <span className="text-primary-text">{to}</span>
  </span>
);

const FieldDiff = ({ field, before, after }) => {
  if (field === "tags") {
    const gained = (after.tags || []).filter(
      (tag) => !(before.tags || []).some((had) => had.toLowerCase() === tag.toLowerCase())
    );
    return <TagList tags={after.tags || []} added={gained} />;
  }
  if (field === "folderId") {
    return <Replaced from={before.folderId || "no folder"} to={after.folderId} />;
  }
  if (field === "url") return <Replaced from={before.url} to={after.url} />;
  if (field === "unreachable") return <Replaced from="set" to="cleared" />;
  if (field === "urlStatus") {
    return <Replaced from={WAS[before.urlStatus] ?? before.urlStatus} to={WAS[after.urlStatus]} />;
  }
  return <span className="text-primary-text">{after.description}</span>;
};

const ChangeReviewModal = ({
  rows = [],
  title = "Review the proposed changes",
  onApply,
  onCancel,
  isApplying = false,
}) => {
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
      title={title}
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

export default React.memo(ChangeReviewModal);
