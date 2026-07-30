// #56: The undo stack, and the toast that offers its most recent entry.
//
// Two things that look like one and are not: the *history* is what Cmd+Z walks
// back through, and the *offer* is the toast. A toast disappearing does not
// discard the history, so an edit from a minute ago is still undoable even
// though its toast is long gone — the same as any editor.
//
// The stack lives in a ref rather than in state because nothing renders it. Only
// the offer does, and the list itself is the feedback that an undo worked.

import { useCallback, useEffect, useRef, useState } from "react";

// Deep enough to walk back out of a mistake, shallow enough that the oldest
// entry still resembles the collection it would restore.
const DEPTH = 10;

// Long enough to notice and reach for, short enough not to become furniture.
const OFFER_MS = 8000;

/**
 * @param {(message: string, type?: string) => void} [showMessage] Told when an
 *   undo fails, since the collection is the only other evidence and it will look
 *   unchanged.
 */
export function useUndoHistory(showMessage) {
  const stackRef = useRef([]);
  const [offered, setOffered] = useState(null);
  const timerRef = useRef(null);
  // An undo in progress. Cmd+Z held down would otherwise pop a second entry
  // while the first is still being written.
  const busyRef = useRef(false);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  /**
   * @param {{label: string, destructive?: boolean, endsHistory?: boolean,
   *   undo: () => Promise<void>}|null} entry
   *   null is accepted and ignored, so a caller can pass whatever an inverse came
   *   to without checking first.
   */
  const record = useCallback((entry) => {
    if (!entry) return;
    clearTimeout(timerRef.current);
    stackRef.current = [entry, ...stackRef.current].slice(0, DEPTH);
    setOffered(entry);
    // A destructive write's offer stays until it is used or dismissed: a timeout
    // on "you just replaced 2,000 bookmarks" is not a safety net.
    if (!entry.destructive) {
      timerRef.current = setTimeout(
        () => setOffered((current) => (current === entry ? null : current)),
        OFFER_MS
      );
    }
  }, []);

  /** Hide the toast. The entry stays in the history for Cmd+Z. */
  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setOffered(null);
  }, []);

  /**
   * Undo the most recent write, whether or not its toast is still showing.
   *
   * @returns {Promise<boolean>} whether a write was taken back.
   */
  const undoLast = useCallback(async () => {
    if (busyRef.current) return false;
    const [top, ...rest] = stackRef.current;
    if (!top) return false;
    stackRef.current = rest;
    busyRef.current = true;
    clearTimeout(timerRef.current);
    setOffered(null);
    try {
      await top.undo();
      // A restore that mints new ids leaves every older entry pointing at ids
      // that no longer exist. Undo stops here rather than failing, or worse,
      // writing to a bookmark that has since been recreated under that id.
      if (top.endsHistory) stackRef.current = [];
      return true;
    } catch (error) {
      console.error("Undo failed:", error);
      // The write is still in effect, so the entry goes back on the stack for
      // another try rather than being quietly dropped.
      stackRef.current = [top, ...rest];
      showMessage?.(`${top.label} failed. Nothing was changed.`, "error");
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [showMessage]);

  return { offered, record, dismiss, undoLast };
}
