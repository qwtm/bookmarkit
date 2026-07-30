// #47: What the link check is doing, and what it found.
//
// Only shown when there is something to say — a sweep in progress, or broken
// links waiting to be dealt with. Dealing with them is the rest of the app's job:
// the row hands over to the "broken only" filter, and from there a selection can
// be re-tagged, edited or deleted like any other.

import React from "react";
import { Button } from "./DesignSystem.jsx";

const LinkSweepBar = React.memo(function LinkSweepBar({
  running,
  checked,
  total,
  brokenCount,
  brokenOnly,
  onStop,
  onShowBroken,
}) {
  if (!running && brokenCount === 0) return null;

  return (
    <div
      className="mb-4 p-3 rounded-lg border border-border bg-primary-bg flex items-center gap-3 flex-wrap"
      role="status"
      aria-live="polite"
    >
      {running ? (
        <>
          <span className="text-sm text-primary-text">
            Checking links… {checked} of {total}
          </span>
          <div className="flex-1 min-w-[6rem] h-1 bg-secondary-bg rounded">
            <div
              className="h-1 bg-accent rounded transition-all"
              style={{ width: `${total ? Math.round((checked / total) * 100) : 0}%` }}
            />
          </div>
          <Button type="button" intent="secondary" size="sm" onClick={onStop}>
            Stop
          </Button>
        </>
      ) : (
        <span className="text-sm text-primary-text">
          {brokenCount} link{brokenCount === 1 ? "" : "s"} could not be reached.
        </span>
      )}

      {brokenCount > 0 && !brokenOnly && (
        <Button type="button" intent="ghost" size="sm" onClick={onShowBroken}>
          Show them
        </Button>
      )}
    </div>
  );
});

export default LinkSweepBar;
