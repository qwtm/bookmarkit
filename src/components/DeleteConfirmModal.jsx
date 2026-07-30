import React from "react";
import { Button, Modal } from "./DesignSystem.jsx";

// A11Y-04, PERF-05: alertdialog role and React.memo. Focus trap, Escape, and
// focus restoration come from Modal (#27); onScrimClick guards both routes out
// so a deletion in flight cannot be abandoned half way.
// UX-09: isLoading prop disables buttons and shows spinner during async deletion.
const DeleteConfirmModal = ({ message, onConfirm, onCancel, isLoading = false }) => {
  return (
    <Modal
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
    </Modal>
  );
};

export default React.memo(DeleteConfirmModal);
