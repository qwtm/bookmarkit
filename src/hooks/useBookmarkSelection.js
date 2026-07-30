// #26: Which bookmarks are selected, and the gestures that change that.
//
// There are two selections rather than one, and it is not redundancy: a single
// click focuses one bookmark, which is also what the URL check and the edit
// shortcut act on, while Ctrl/Cmd+click builds a set. Making a set clears the
// focused one and vice versa, so the two can never disagree about what "the
// selection" means — `selectedIds` is that answer.

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * @param {(bookmark: object) => void} onOpen Shift+click and Shift+Enter open a
 *   bookmark rather than select it. Opening is not this hook's concern, so it is
 *   handed out — but the selection clears either way, since the user has moved on.
 */
export function useBookmarkSelection(onOpen) {
  const [selectedId, setSelectedId] = useState(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState([]);

  const clear = useCallback(() => {
    setSelectedId(null);
    setMultiSelectedIds([]);
  }, []);

  // A mousedown anywhere that is not a bookmark card (cards stop propagation)
  // clears the selection: header, buttons, dialogs, empty space, everything.
  useEffect(() => {
    document.addEventListener("mousedown", clear);
    return () => document.removeEventListener("mousedown", clear);
  }, [clear]);

  const open = useCallback(
    (bookmark) => {
      onOpen(bookmark);
      clear();
    },
    [onOpen, clear]
  );

  const onBookmarkClick = useCallback(
    (bookmark, event) => {
      if (event?.shiftKey || event?.key === " ") {
        open(bookmark);
        return;
      }
      if (event?.metaKey || event?.ctrlKey) {
        setMultiSelectedIds((prev) => {
          // A single click before the first Ctrl+click set `selectedId`; carry it
          // in, so extending starts from what the user can see is selected.
          const seeded =
            selectedId && !prev.includes(selectedId) ? [...prev, selectedId] : [...prev];
          return seeded.includes(bookmark.id)
            ? seeded.filter((id) => id !== bookmark.id)
            : [...seeded, bookmark.id];
        });
        setSelectedId(null);
        return;
      }
      setSelectedId(bookmark.id);
      setMultiSelectedIds([]);
    },
    [selectedId, open]
  );

  const onBookmarkKeyDown = useCallback(
    (event, bookmark) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.shiftKey) {
        onBookmarkClick(bookmark);
        return;
      }
      if (bookmark.url) open(bookmark);
    },
    [onBookmarkClick, open]
  );

  /** Whichever selection the user made: the focused bookmark, or the checked set. */
  const selectedIds = useMemo(() => {
    if (selectedId) return [selectedId];
    return multiSelectedIds.length ? [...multiSelectedIds] : [];
  }, [selectedId, multiSelectedIds]);

  return {
    selectedId,
    multiSelectedIds,
    selectedIds,
    /** #22: the visible (filtered) bookmarks, not everything in the store. */
    selectAll: setMultiSelectedIds,
    clear,
    onBookmarkClick,
    onBookmarkKeyDown,
  };
}
