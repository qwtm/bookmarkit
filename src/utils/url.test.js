import { describe, it, expect } from "vitest";
import {
  isSafeHttpUrl,
  isPrivateOrLoopbackHost,
  isPublicHttpUrl,
  escapeHtml,
  normalizeUrl,
} from "./url.js";

describe("isSafeHttpUrl (#11)", () => {
  it("accepts http and https", () => {
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
    expect(isSafeHttpUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects dangerous schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("chrome://settings")).toBe(false);
  });

  it("rejects non-strings, empty, and unparseable values", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});

describe("isPrivateOrLoopbackHost (#10)", () => {
  it("flags loopback, private, and link-local hosts", () => {
    for (const h of [
      "localhost",
      "app.localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.1",
      "172.16.5.5",
      "172.31.255.255",
      "169.254.169.254", // cloud metadata endpoint
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1", // IPv4-mapped loopback (dotted)
      "::ffff:7f00:1", // IPv4-mapped loopback (hex-normalized)
      "::ffff:169.254.169.254", // IPv4-mapped metadata endpoint
    ]) {
      expect(isPrivateOrLoopbackHost(h)).toBe(true);
    }
  });

  it("allows public hosts, incl. domains that start with IPv6 prefixes", () => {
    for (const h of [
      "example.com",
      "8.8.8.8",
      "172.15.0.1",
      "172.32.0.1",
      "93.184.216.34",
      "fcbarcelona.com", // must NOT be treated as an fc00::/7 IPv6 literal
      "fdn.example",
      "fe80.example.com",
    ]) {
      expect(isPrivateOrLoopbackHost(h)).toBe(false);
    }
  });
});

describe("isPublicHttpUrl (#10)", () => {
  it("accepts public http(s) URLs only", () => {
    expect(isPublicHttpUrl("https://example.com")).toBe(true);
    expect(isPublicHttpUrl("http://127.0.0.1:8080")).toBe(false);
    expect(isPublicHttpUrl("http://localhost")).toBe(false);
    expect(isPublicHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicHttpUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
  });
});

describe("normalizeUrl (#45)", () => {
  it("collapses scheme, www., and a trailing slash", () => {
    const expected = "example.com/post";
    expect(normalizeUrl("http://example.com/post")).toBe(expected);
    expect(normalizeUrl("https://example.com/post")).toBe(expected);
    expect(normalizeUrl("https://www.example.com/post/")).toBe(expected);
    expect(normalizeUrl("  HTTPS://WWW.EXAMPLE.COM/post  ")).toBe(expected);
  });

  it("strips tracking parameters and sorts what remains", () => {
    expect(normalizeUrl("https://example.com/p?utm_source=x&utm_medium=y&id=7")).toBe(
      "example.com/p?id=7"
    );
    expect(normalizeUrl("https://example.com/p?fbclid=a&gclid=b&ref=twitter")).toBe(
      "example.com/p"
    );
    expect(normalizeUrl("https://example.com/p?b=2&a=1")).toBe(
      normalizeUrl("https://example.com/p?a=1&b=2")
    );
  });

  it("keeps path case, the fragment, and a non-default port", () => {
    expect(normalizeUrl("https://example.com/Path")).toBe("example.com/Path");
    expect(normalizeUrl("https://example.com/p#install")).toBe("example.com/p#install");
    expect(normalizeUrl("https://example.com:8443/p")).toBe("example.com:8443/p");
    expect(normalizeUrl("https://example.com:443/p")).toBe("example.com/p");
  });

  it("falls back to the trimmed text when the url will not parse", () => {
    expect(normalizeUrl("  Example.com/a ")).toBe("example.com/a");
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl(null)).toBe("");
  });
});

describe("escapeHtml (#12)", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml("a & b < c > d \" e ' f")).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f");
  });

  it("neutralizes an attribute-breaking bookmark title", () => {
    expect(escapeHtml('"><img src=x onerror=alert(1)>')).toBe(
      "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"
    );
  });

  it("stringifies null/undefined to empty", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
