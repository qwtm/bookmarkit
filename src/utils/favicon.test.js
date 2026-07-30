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

  // An icon address saved on a bookmark is not automatically safe: an imported
  // Netscape ICON attribute, or a google.com/s2 URL an older version persisted,
  // is someone else's server.
  describe("an icon address saved on the bookmark", () => {
    it("is not fetched while the opt-in is off", () => {
      for (const storedIcon of [
        "https://www.google.com/s2/favicons?domain=example.com&sz=32",
        "https://tracker.example/pixel.png",
        "https://example.com/favicon.ico",
      ]) {
        expect(faviconSrc("https://example.com/page", { storedIcon })).toBe(FAVICON_PLACEHOLDER);
      }
    });

    it("wins over a derived icon once fetching is allowed", () => {
      expect(
        faviconSrc("https://example.com/page", {
          storedIcon: "https://example.com/custom.png",
          allowRemote: true,
        })
      ).toBe("https://example.com/custom.png");
    });

    it("is shown even with the opt-in off when it is inline data", () => {
      const inline = "data:image/png;base64,iVBORw0KGgo=";
      expect(faviconSrc("https://example.com/page", { storedIcon: inline })).toBe(inline);
    });

    it("is refused when it is not an http(s) address", () => {
      expect(
        faviconSrc("https://example.com/page", {
          storedIcon: "javascript:alert(1)",
          allowRemote: true,
        })
      ).not.toContain("javascript:");
    });
  });
});
