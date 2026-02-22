// ARCH-06, PERF-07: Generic debounce hook.
// Returns a debounced version of `value` that only updates after `delayMs` of inactivity.

import { useEffect, useState } from "react";

export function useDebounce(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
