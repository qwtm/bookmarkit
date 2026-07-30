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

/**
 * @param {string} url
 * @returns {Promise<{status: "idle"|"valid"|"invalid", redirectUrl: string|null}>}
 */
export function fetchUrlStatus(url) {
  if (!url) return Promise.resolve({ status: "idle", redirectUrl: null });

  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CHECK_URL", url }, (result) => {
        resolve(result ?? { status: "invalid", redirectUrl: null });
      });
    });
  }

  return fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) })
    .then((res) => ({
      status: res.ok ? "valid" : "invalid",
      redirectUrl: res.url && res.url !== url ? res.url : null,
    }))
    .catch(() => ({ status: "invalid", redirectUrl: null }));
}
