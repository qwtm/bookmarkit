// UX-07: LLM error classification — maps raw errors to user-friendly messages.
// Error strings are never exposed verbatim; users see actionable guidance instead.

/**
 * @typedef {'api_key' | 'rate_limit' | 'network' | 'parse' | 'generic'} LLMErrorCategory
 */

// #28: A TypeError only means "network" when it is the one fetch throws. Browsers
// word that differently — "Failed to fetch" (Chrome), "NetworkError when
// attempting to fetch resource." (Firefox), "Load failed" (Safari) — and every
// other TypeError is a programming mistake that must not be dressed up as a
// connectivity problem.
const FETCH_TYPE_ERROR = /failed to fetch|networkerror|network error|load failed/u;

// Ordered most specific first; the first match wins.
const CATEGORY_RULES = [
  {
    category: "api_key",
    message:
      'API key is missing or invalid. Open Options (type "options" in the search bar) to enter your API key.',
    matches: ({ status, msg }) =>
      status === 401 ||
      status === 403 ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("api key"),
  },
  {
    category: "rate_limit",
    message: "Rate limit reached. Please wait a moment before trying again.",
    matches: ({ status, msg }) =>
      status === 429 ||
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("quota"),
  },
  {
    category: "network",
    message:
      "Could not reach the LLM provider. Check your internet connection and provider settings.",
    matches: ({ name, msg }) =>
      (name === "TypeError" && FETCH_TYPE_ERROR.test(msg)) ||
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("connection") ||
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("cors"),
  },
  {
    category: "parse",
    message: "The AI returned an unexpected response. Try rephrasing your query.",
    matches: ({ msg }) =>
      msg.includes("json") ||
      msg.includes("parse") ||
      msg.includes("interpret") ||
      msg.includes("unexpected token"),
  },
];

const GENERIC = {
  category: "generic",
  message: "Could not process your request. Check your LLM provider settings and try again.",
};

/**
 * Classify a fetch/LLM error into a category and return a user-friendly message.
 *
 * @param {Error} error
 * @returns {{ category: LLMErrorCategory, message: string }}
 */
export function classifyLLMError(error) {
  const msg = (error?.message || "").toLowerCase();
  const subject = { msg, name: error?.name, status: error?.status || extractHttpStatus(msg) };
  const rule = CATEGORY_RULES.find((candidate) => candidate.matches(subject)) || GENERIC;
  return { category: rule.category, message: rule.message };
}

function extractHttpStatus(msg) {
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}
