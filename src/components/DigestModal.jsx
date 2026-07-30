// #50: The week, read back.
//
// Three sections, each of which is a list of bookmarks that can be opened from
// here, plus two ways out into work the app already does: filter to the ones
// nothing ever opened, or hand the untagged ones to the organizer (#44).
//
// It renders what it is given and decides nothing. Which bookmarks belong in each
// section is `utils/digest.js`, and the theme names either came from a model or
// from the folders the bookmarks are already in — the modal cannot tell, on purpose.

import React from "react";

import { themeItems } from "../utils/digest.js";
import { Button, Modal } from "./DesignSystem.jsx";

const ItemList = ({ items, onOpen }) => (
  <ul className="space-y-0.5">
    {items.map((bookmark) => (
      <li key={bookmark.id}>
        <button
          type="button"
          onClick={() => onOpen(bookmark)}
          className="text-left text-sm text-accent hover:underline truncate max-w-full"
          title={bookmark.url}
        >
          {bookmark.title || bookmark.url}
        </button>
      </li>
    ))}
  </ul>
);

const Section = ({ title, hint, children }) => (
  <section className="mb-4">
    <h3 className="text-sm font-medium text-primary-text">{title}</h3>
    {hint && <p className="text-xs text-secondary-text mb-1">{hint}</p>}
    {children}
  </section>
);

const DigestModal = ({ digest, onOpen, onShowNeverOpened, onTriage, onClose }) => {
  const { added = [], neverOpened = [], untagged = [], themes = [] } = digest || {};

  return (
    <Modal
      title="This week in your bookmarks"
      size="lg"
      onClose={onClose}
      onScrimClick={onClose}
      footer={
        <>
          {neverOpened.length > 0 && (
            <Button intent="secondary" onClick={onShowNeverOpened}>
              Show never opened
            </Button>
          )}
          {untagged.length > 0 && (
            <Button intent="secondary" onClick={() => onTriage(untagged)}>
              Triage the untagged
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="max-h-96 overflow-y-auto">
        {added.length > 0 && (
          <Section
            title={`Saved this week (${added.length})`}
            hint={themes.length > 0 ? "Grouped by theme." : undefined}
          >
            {themes.map((theme) => (
              <div key={theme.title} className="mt-2">
                <p className="text-sm text-primary-text">{theme.title}</p>
                {theme.summary && <p className="text-xs text-secondary-text">{theme.summary}</p>}
                <ItemList items={themeItems(theme, added)} onOpen={onOpen} />
              </div>
            ))}
          </Section>
        )}

        {neverOpened.length > 0 && (
          <Section
            title={`Never opened (${neverOpened.length})`}
            hint="Saved a while ago and not opened since — oldest first."
          >
            <ItemList items={neverOpened} onOpen={onOpen} />
          </Section>
        )}

        {untagged.length > 0 && (
          <Section
            title={`Untagged (${untagged.length})`}
            hint="Filed in a hurry. The organizer can suggest tags for these."
          >
            <ItemList items={untagged} onOpen={onOpen} />
          </Section>
        )}
      </div>
    </Modal>
  );
};

export default React.memo(DigestModal);
