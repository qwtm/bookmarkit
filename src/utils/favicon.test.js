import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FAVICON_PLACEHOLDER,
  REMOTE_FAVICONS_KEY,
  faviconSrc,
  remoteFaviconsEnabled,
  setRemoteFaviconsEnabled,
} from "./favicon.js";

describe("remote favicon opt-in", () => {
  beforeEach(() => localStorage.clear());

  it("is off until the user turns it on", () => {
    expect(remoteFaviconsEnabled()).toBe(false);
    setRemoteFaviconsEnabled(true);
    expect(remoteFaviconsEnabled()).toBe(true);
    setRemoteFaviconsEnabled(false);
    expect(remoteFaviconsEnabled()).toBe(false);
  });

  it("treats a missing or junk stored value as off", () => {
    localStorage.setItem(REMOTE_FAVICONS_KEY, "yes please");
    expect(remoteFaviconsEnabled()).toBe(false);
  });
});

describe("faviconSrc", () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it("never contacts a third party by default", () => {
    expect(faviconSrc("https://example.com/private/page")).toBe(FAVICON_PLACEHOLDER);
  });

  it("sends only the hostname once the user opts in", () => {
    const src = faviconSrc("https://example.com/secret/page?token=abc#frag", {
      allowRemote: true,
    });
    expect(src).toBe("https://www.google.com/s2/favicons?domain=example.com&sz=32");
    expect(src).not.toContain("secret");
    expect(src).not.toContain("token");
  });

  it("prefers the browser's own cache over the remote service", () => {
    globalThis.chrome = { runtime: { getURL: (path) => `chrome-extension://abc${path}` } };
    const src = faviconSrc("https://example.com/page", { allowRemote: true });
    expect(src).toContain("chrome-extension://abc/_favicon/");
    expect(src).toContain("pageUrl=https%3A%2F%2Fexample.com%2Fpage");
    expect(src).not.toContain("google.com");
  });

  it("falls back to the placeholder for URLs it will not fetch", () => {
    for (const url of ["", undefined, "javascript:alert(1)", "not a url", "file:///etc/passwd"]) {
      expect(faviconSrc(url, { allowRemote: true })).toBe(FAVICON_PLACEHOLDER);
    }
  });

  it("honors a requested size", () => {
    expect(faviconSrc("https://example.com", { allowRemote: true, size: 64 })).toContain("sz=64");
  });
});
