import React from "react";

const HelpModal = ({ onClose }) => (
  <div
    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    onClick={(e) => e.target === e.currentTarget && onClose()}
    role="dialog"
    aria-modal="true"
  >
    <div className="bg-primary-bg rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto">
      <div className="p-6">
        <div className="flex justify-between items-start">
          <h2 className="text-2xl font-semibold mb-4 text-primary-text">
            Help & Features
          </h2>
          <button
            onClick={onClose}
            className="text-secondary-text hover:text-primary-text transition-colors"
            aria-label="Close help"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="space-y-6 text-secondary-text">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-primary-text">
              Natural Language Search
            </h3>
            <p>
              The main search bar is powered by an AI agent. Type commands in
              plain English to find, sort, and manage your bookmarks. Try things
              like: "options", "find github", "find tags: react then sort by
              rating descending", "show 3 stars or more", "filter rating &gt;= 4
              then sort by title asc", or "remove duplicates".
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2 text-primary-text">
              Keyboard Shortcuts
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>
                <strong>Click</strong> selects a bookmark.
              </li>
              <li>
                <strong>Cmd/Ctrl+Click</strong> toggles multi-select for a
                bookmark.
              </li>
              <li>
                <strong>Shift+Click</strong> or press{" "}
                <kbd className="font-sans px-1.5 py-0.5 border border-border bg-secondary-bg rounded">
                  Space
                </kbd>{" "}
                opens the bookmark in a new tab.
              </li>
              <li>
                <strong>Double-click</strong> or press{" "}
                <kbd className="font-sans px-1.5 py-0.5 border border-border bg-secondary-bg rounded">
                  E
                </kbd>{" "}
                to edit the selected bookmark.
              </li>
              <li>
                <strong>Esc</strong> clears selection and any pending deletes.
              </li>
              <li>
                <strong>Cmd/Ctrl+A</strong> selects all visible bookmarks.
              </li>
              <li>
                Press{" "}
                <kbd className="font-sans px-1.5 py-0.5 border border-border bg-secondary-bg rounded">
                  D
                </kbd>{" "}
                or <strong>Cmd/Ctrl+D</strong> to delete selected (opens
                confirmation).
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2 text-primary-text">
              Tips
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>
                Use the <strong>Remove Duplicates</strong> button (or type
                "remove duplicates" into the search) to find and delete
                duplicates by title+URL.
              </li>
              <li>
                <strong>Import/Export</strong> lets you back up or restore
                bookmarks from JSON/HTML.
              </li>
            </ul>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default HelpModal;
