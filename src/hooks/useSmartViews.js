// #49: Where saved views live between sessions.
//
// Storage is the whole job here — what a view *is* and what makes one safe to
// load belongs to `utils/smartViews.js`, which has no React and no storage in it.
// This reads the list once, keeps it in state, and writes the list back whenever
// it changes.

import { useCallback, useEffect, useState } from "react";
import { readSetting, writeSetting } from "../utils/extensionStorage.js";
import { addView, makeView, readViews, removeView, serializeViews } from "../utils/smartViews.js";

const VIEWS_KEY = "bm_smart_views";

export function useSmartViews() {
  const [views, setViews] = useState([]);

  useEffect(() => {
    (async () => {
      const stored = await readSetting(VIEWS_KEY);
      // Sanitizing on load means a view saved by a newer version, or edited by
      // hand, cannot bring an unknown action with it.
      const loaded = readViews(stored);
      if (loaded.length > 0) setViews(loaded);
    })();
  }, []);

  const persist = useCallback((next) => {
    setViews(next);
    writeSetting(VIEWS_KEY, serializeViews(next));
  }, []);

  /**
   * @returns {boolean} false when there was nothing worth saving under that name.
   */
  const save = useCallback(
    (name, plan, filters) => {
      const view = makeView(name, plan, filters);
      if (!view) return false;
      persist(addView(views, view));
      return true;
    },
    [views, persist]
  );

  const forget = useCallback((id) => persist(removeView(views, id)), [views, persist]);

  return { views, save, forget };
}
