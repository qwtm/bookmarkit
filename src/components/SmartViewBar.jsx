// #49: The row of saved views, and the one control that adds to it.
//
// A chip restores both halves of what was saved — the agent plan and the manual
// filters — because that is what the user was looking at when they saved it.

import React, { useState } from "react";
import { Button, Input } from "./DesignSystem.jsx";

const SmartViewBar = React.memo(function SmartViewBar({
  views,
  activeViewId,
  canSave,
  onApply,
  onSave,
  onForget,
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (onSave(name)) {
      setName("");
      setNaming(false);
    }
  };

  if (views.length === 0 && !canSave) return null;

  return (
    <div className="mb-4 flex items-center gap-2 flex-wrap" role="group" aria-label="Saved views">
      {views.map((view) => {
        const active = view.id === activeViewId;
        return (
          <span
            key={view.id}
            className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs rounded-full border ${
              active
                ? "bg-accent text-white border-accent"
                : "bg-primary-bg text-primary-text border-border"
            }`}
          >
            <button
              type="button"
              onClick={() => onApply(view)}
              className="focus:outline-none focus:ring-2 focus:ring-accent rounded"
              // The chip's own state matters: pressing the active one again is a
              // no-op, and a screen reader should not have to guess that.
              aria-pressed={active}
            >
              {view.name}
            </button>
            <button
              type="button"
              onClick={() => onForget(view.id)}
              className="opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent rounded px-1"
              aria-label={`Delete view ${view.name}`}
            >
              ✕
            </button>
          </span>
        );
      })}

      {canSave && !naming && (
        <Button type="button" size="sm" intent="ghost" onClick={() => setNaming(true)}>
          Save current view
        </Button>
      )}

      {naming && (
        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            id="smart-view-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this view…"
            aria-label="Name for the saved view"
            wrapperClassName="w-[12.5rem]"
            autoFocus
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            intent="ghost"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
});

export default SmartViewBar;
