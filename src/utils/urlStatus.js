// The one way this app asks whether a URL still answers.
//
// In the extension the question goes to the service worker, which fetches from a
// privileged context that CORS does not apply to and which enforces the SSRF
// boundary (#10): public http(s) only, `redirect: "manual"`, and a redirect
// target it will not disclose. In the web build there is no worker, so the fetch
// happens here and CORS decides what is answerable.
//
// #47: extracted from BookmarkApp so the sweep and the select-time check ask the
// same question the same way, instead of two implementations drifting apart.
//
// The boundary is the same on both paths, not just the worker's: only public
// http(s) hosts are asked about, and a redirect is never followed. In the web
// build the fetch is not privileged, but the request still leaves the browser,
// so a public URL answering 30x with a private Location would otherwise reach an
// internal host before anything could look at it.

import { isPublicHttpUrl } from "./url.js";

const UNREACHABLE = { status: "invalid", redirectUrl: null };

/**
 * @param {string} url
 * @returns {Promise<{status: "idle"|"valid"|"invalid", redirectUrl: string|null}>}
 */
export function fetchUrlStatus(url) {
  if (!url) return Promise.resolve({ status: "idle", redirectUrl: null });
  if (!isPublicHttpUrl(url)) return Promise.resolve({ ...UNREACHABLE });

  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CHECK_URL", url }, (result) => {
        resolve(result ?? { ...UNREACHABLE });
      });
    });
  }

  return fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) })
    .then((res) => {
      // A redirect is "reachable, but we do not chase or expose the target" —
      // the same answer the worker gives, for the same reason.
      if (res.type === "opaqueredirect") return { status: "valid", redirectUrl: null };
      return { status: res.ok ? "valid" : "invalid", redirectUrl: null };
    })
    .catch(() => ({ ...UNREACHABLE }));
}
