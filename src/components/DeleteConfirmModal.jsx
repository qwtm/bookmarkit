import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

// A11Y-02, A11Y-04, PERF-05: Accessible delete confirmation modal with focus trap,
// alertdialog role, Escape key handler, focus restoration, and React.memo.
// UX-09: isLoading prop disables buttons and shows spinner during async deletion.
const DeleteConfirmModal = ({ message, onConfirm, onCancel, isLoading = false }) => {
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
    // A11Y-04: role="alertdialog" for confirmations requiring immediate user response
    <div
      ref={containerRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      aria-describedby="delete-confirm-msg"
      className="p-6 text-center bg-primary-bg rounded-lg"
      tabIndex={-1}
    >
      <h3
        id="delete-confirm-title"
        className="text-xl font-semibold mb-4 text-primary-text"
      >
        Confirm Deletion
      </h3>
      <p id="delete-confirm-msg" className="text-secondary-text mb-6">
        {message}
      </p>
      <div className="flex justify-center space-x-4">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="px-6 py-2 bg-secondary-bg text-primary-text border border-border rounded-md hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading && (
            <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {isLoading ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
};

export default React.memo(DeleteConfirmModal);
