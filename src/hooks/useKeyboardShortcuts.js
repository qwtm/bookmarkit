// #27: Window-level keyboard shortcuts, declared rather than hand-rolled. The
// app had two near-identical keydown effects, each re-deriving the platform's
// modifier key, each re-checking whether the user was typing, and one of them
// carrying an eight-entry dependency array that resubscribed on every state
// change. Only the bindings differed.

import { useEffect, useRef } from "react";

const TYPING_TAGS = new Set(["input", "textarea", "select"]);

// A shortcut must never fire while the user is filling something in. A keystroke
// in a rich text region can land on a descendant rather than on the editable
// host, so the region is what decides, not the immediate target.
function isTypingContext(target) {
  if (TYPING_TAGS.has(target?.tagName?.toLowerCase())) return true;
  if (target?.isContentEditable) return true;
  return Boolean(target?.closest?.('[contenteditable]:not([contenteditable="false"])'));
}

function onMac() {
  const platform = navigator.userAgentData?.platform || navigator.userAgent;
  return /mac/iu.test(platform);
}

/**
 * The combo a binding would have to be named to match this event, or null when
 * no binding could. "Mod" is Command on macOS and Control elsewhere; the other
 * one is deliberately not a synonym, so Control+A on a Mac stays the caret
 * shortcut it is there. Letters match regardless of case, and Alt is unbound.
 */
function comboFor(event) {
  if (event.altKey) return null;
  const [primary, secondary] = onMac()
    ? [event.metaKey, event.ctrlKey]
    : [event.ctrlKey, event.metaKey];
  if (secondary) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return primary ? `Mod+${key}` : key;
}

/**
 * Bind keyboard shortcuts for as long as they apply.
 *
 * Handlers are read at keypress time, so a binding may close over current state
 * without resubscribing, and `enabled` is how a caller suspends the whole set —
 * an open dialog owns the keyboard, and no individual handler should have to
 * know that.
 *
 * @param {Record<string, (event: KeyboardEvent) => void>} bindings Keyed by
 *   combo: "Escape", "h", "Mod+a".
 * @param {{ enabled?: boolean }} [options]
 */
export function useKeyboardShortcuts(bindings, { enabled = true } = {}) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event) => {
      if (isTypingContext(event.target)) return;
      const combo = comboFor(event);
      if (combo) bindingsRef.current[combo]?.(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
