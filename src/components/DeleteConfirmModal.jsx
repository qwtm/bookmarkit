import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { Button, Modal } from "./DesignSystem.jsx";

// A11Y-02, A11Y-04, PERF-05: Accessible delete confirmation modal with focus trap,
// alertdialog role, Escape key handler, focus restoration, and React.memo.
// UX-09: isLoading prop disables buttons and shows spinner during async deletion.
// #86: `reasons` explains a proposal the user did not make by hand — a model's
// verdict that two bookmarks are the same page. Nothing is deleted without the
// pair, and the reason for it, being visible first.
const DeleteConfirmModal = ({ message, reasons = [], onConfirm, onCancel, isLoading = false }) => {
  const containerRef = useRef(null);
  useFocusTrap(containerRef);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <Modal
      ref={containerRef}
      role="alertdialog"
      title="Confirm Deletion"
      titleId="delete-confirm-title"
      descriptionId="delete-confirm-msg"
      size="md"
      hideClose
      onScrimClick={() => !isLoading && onCancel()}
      footer={
        <>
          <Button intent="secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button intent="danger" onClick={onConfirm} loading={isLoading}>
            {isLoading ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    >
      <p id="delete-confirm-msg" className="text-secondary-text text-center">
        {message}
      </p>

      {reasons.length > 0 && (
        <ul className="mt-3 max-h-60 overflow-y-auto text-sm space-y-2">
          {reasons.map(({ id, title, keptTitle, reason }) => (
            <li key={id} className="p-2 rounded border border-border">
              <span className="text-primary-text">{title}</span>
              <span className="text-secondary-text"> — same page as </span>
              <span className="text-primary-text">{keptTitle}</span>
              <div className="text-xs text-secondary-text">{reason}</div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

export default React.memo(DeleteConfirmModal);
