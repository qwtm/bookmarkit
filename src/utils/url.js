// URL helpers shared across the app: navigation safety, canonical identity, and
// HTML escaping.

// #11: Only http(s) URLs are safe to navigate to or import. This blocks
// javascript:, data:, file:, blob:, chrome:, etc. which can execute code or
// exfiltrate context when opened.
export function isSafeHttpUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

// #10: A host is private/loopback/link-local (or otherwise non-public) if it
// resolves to the local machine or an internal network. Used to keep the
// privileged service-worker fetch (CHECK_URL) from being pointed at internal
// resources (SSRF). Mirrored in public/background.js, which cannot import this.
function isPrivateIpv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 0 || a === 127) return true; // this-host / loopback
  if (a === 10) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  return false;
}

// Extract the embedded IPv4 from an IPv4-mapped IPv6 host. Browsers normalize
// `::ffff:127.0.0.1` to the hex form `::ffff:7f00:1`, so handle both.
function mappedIpv4(host) {
  const m = host.match(/^::ffff:(.+)$/i);
  if (!m) return null;
  const rest = m[1];
  if (rest.includes(".")) return rest; // ::ffff:127.0.0.1
  const parts = rest.split(":");
  if (parts.length !== 2) return null;
  const hi = parseInt(parts[0], 16);
  const lo = parseInt(parts[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isPrivateOrLoopbackHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isPrivateIpv4(host)) return true;
  const isIpv6 = host.includes(":");
  if (isIpv6) {
    if (host === "::1" || host === "::") return true;
    // IPv6 prefix checks apply only to literals, never to domain names such
    // as "fcbarcelona.com" or "fdn.example" (Codex #33).
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local
    if (host.startsWith("fe80")) return true; // link-local
    // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 / ::ffff:7f00:1 (Codex #33).
    const v4 = mappedIpv4(host);
    if (v4 && isPrivateIpv4(v4)) return true;
  }
  return false;
}

// #10: Safe target for the privileged background fetch — http(s) to a public host.
export function isPublicHttpUrl(url) {
  if (!isSafeHttpUrl(url)) return false;
  try {
    return !isPrivateOrLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

// #45: Query parameters that identify a campaign or a click rather than a
// resource. Two URLs differing only by these point at the same page.
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "twclid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

const isTrackingParam = (name) => name.startsWith("utm_") || TRACKING_PARAMS.has(name);

/**
 * #45: Reduce a URL to the page it identifies, so incidental differences do not
 * read as different bookmarks. Drops the scheme (http/https are the same page),
 * lowercases and de-`www.`s the host, removes tracking parameters, sorts the
 * rest, and strips a trailing slash. The path, remaining query, and fragment
 * keep their case — those are meaningful to the server.
 *
 * The result is an identity key, not a navigable URL.
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not parseable (a bare "example.com/a", say) — fall back to the raw text so
    // identical strings still match each other.
    return trimmed.toLowerCase();
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const port = parsed.port ? `:${parsed.port}` : "";
  const path = parsed.pathname.replace(/\/$/u, "");
  const kept = [...parsed.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = new URLSearchParams(kept).toString();
  return `${host}${port}${path}${search ? `?${search}` : ""}${parsed.hash}`;
}

// #12: Escape a value for safe interpolation into HTML text or a double-quoted
// attribute (used when building the Netscape bookmark export by hand).
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
