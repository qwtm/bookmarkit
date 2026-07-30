import React from "react";
import { Button, Kbd, Modal } from "./DesignSystem.jsx";

// PERF-05: React.memo to skip unnecessary re-renders. Focus trap, Escape, and
// focus restoration come from Modal (#27).
const HelpModal = ({ onClose }) => {
  return (
    <Modal
      title="Help & Features"
      titleId="help-modal-title"
      closeLabel="Close help"
      onClose={onClose}
      size="2xl"
      footer={<Button onClick={onClose}>Got it!</Button>}
    >
      <div className="space-y-6 text-secondary-text">
        <div>
          <h3 className="text-lg font-semibold mb-2 text-primary-text">Natural Language Search</h3>
          <p>
            The main search bar is powered by an AI agent. Type commands in plain English to find,
            sort, and manage your bookmarks. Try things like: "options", "find github", "find tags:
            react then sort by rating descending", "show 3 stars or more", "filter rating &gt;= 4
            then sort by title asc", or "remove duplicates".
          </p>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2 text-primary-text">Keyboard Shortcuts</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Click</strong> selects a bookmark.
            </li>
            <li>
              <strong>Cmd/Ctrl+Click</strong> toggles multi-select for a bookmark.
            </li>
            <li>
              <strong>Shift+Click</strong> or press <Kbd>Space</Kbd> opens the bookmark in a new
              tab.
            </li>
            <li>
              <strong>Double-click</strong> or press <Kbd>E</Kbd> to edit the selected bookmark.
            </li>
            <li>
              <strong>Esc</strong> clears selection and any pending deletes.
            </li>
            <li>
              <strong>Cmd/Ctrl+A</strong> selects all visible bookmarks.
            </li>
            <li>
              Press <Kbd>D</Kbd> or <strong>Cmd/Ctrl+D</strong> to delete selected (opens
              confirmation).
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2 text-primary-text">Tips</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              Use the <strong>Remove Duplicates</strong> button (or type "remove duplicates" into
              the search) to find and delete duplicates by title+URL.
            </li>
            <li>
              <strong>Import/Export</strong> lets you back up or restore bookmarks from JSON/HTML.
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};

export default React.memo(HelpModal);
