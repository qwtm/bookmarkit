// #26: UX-05's one-level undo. Small, but it owns a timer that must be cleared
// on unmount and whenever a second undoable action replaces the first — which is
// the kind of thing that quietly rots inside a large component.

import { useCallback, useEffect, useRef, useState } from "react";

// Long enough to notice and reach for, short enough that the toast is not
// furniture. Only the most recent action is offered.
const VISIBLE_MS = 8000;

export function useUndoToast() {
  const [action, setAction] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  /**
   * @param {string} label What the button says, e.g. "Undo delete (3)".
   * @param {() => Promise<void>} restore Run when the user takes the offer.
   */
  const offer = useCallback((label, restore) => {
    clearTimeout(timerRef.current);
    setAction({ label, restore });
    timerRef.current = setTimeout(() => setAction(null), VISIBLE_MS);
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setAction(null);
  }, []);

  return { action, offer, dismiss };
}
