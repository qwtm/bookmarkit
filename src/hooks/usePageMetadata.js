// #48: What the page at this URL says about itself, fetched once and kept.
//
// The form asks for a URL's metadata as the user types, so the two things this
// owns are both about not being wasteful: a URL is fetched once per session, and
// a URL still being typed is left alone until it settles.

import { useEffect, useRef, useState } from "react";

import { fetchPageMetadata } from "../utils/pageMetadata.js";
import { isPublicHttpUrl } from "../utils/url.js";

const SETTLE_MS = 800;

/**
 * @param {string} url
 * @param {{enabled?: boolean, settleMs?: number}} [options]
 * @returns {{meta: {title: string, description: string, text: string}|null, loading: boolean}}
 */
export function usePageMetadata(url, { enabled = true, settleMs = SETTLE_MS } = {}) {
  const [state, setState] = useState({ meta: null, loading: false });
  // A page's own description does not change while a form is open, and the same
  // URL is often retyped: one answer per URL is plenty.
  const seen = useRef(new Map());

  useEffect(() => {
    if (!enabled || !isPublicHttpUrl(url)) {
      setState({ meta: null, loading: false });
      return undefined;
    }
    if (seen.current.has(url)) {
      setState({ meta: seen.current.get(url), loading: false });
      return undefined;
    }

    let cancelled = false;
    setState({ meta: null, loading: true });
    const timer = setTimeout(() => {
      fetchPageMetadata(url)
        .then((meta) => {
          seen.current.set(url, meta);
          if (!cancelled) setState({ meta, loading: false });
        })
        .catch(() => {
          if (!cancelled) setState({ meta: null, loading: false });
        });
    }, settleMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, enabled, settleMs]);

  return state;
}
