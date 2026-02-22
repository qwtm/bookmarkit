// UX-07: LLM error classification — maps raw errors to user-friendly messages.
// Error strings are never exposed verbatim; users see actionable guidance instead.

/**
 * @typedef {'api_key' | 'rate_limit' | 'network' | 'parse' | 'generic'} LLMErrorCategory
 */

/**
 * Classify a fetch/LLM error into a category and return a user-friendly message.
 *
 * @param {Error} error
 * @returns {{ category: LLMErrorCategory, message: string }}
 */
export function classifyLLMError(error) {
  const msg = (error?.message || "").toLowerCase();
  const status = error?.status || extractHttpStatus(msg);

  // Auth failures — missing or invalid API key
  if (status === 401 || status === 403 || msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("invalid api key") || msg.includes("api key")) {
    return {
      category: "api_key",
      message: "API key is missing or invalid. Open Options (type \"options\" in the search bar) to enter your API key.",
    };
  }

  // Rate limit
  if (status === 429 || msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("quota")) {
    return {
      category: "rate_limit",
      message: "Rate limit reached. Please wait a moment before trying again.",
    };
  }

  // Network / connectivity
  if (
    error?.name === "TypeError" ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("cors")
  ) {
    return {
      category: "network",
      message: "Could not reach the LLM provider. Check your internet connection and provider settings.",
    };
  }

  // JSON parse / response interpretation
  if (msg.includes("json") || msg.includes("parse") || msg.includes("interpret") || msg.includes("unexpected token")) {
    return {
      category: "parse",
      message: "The AI returned an unexpected response. Try rephrasing your query.",
    };
  }

  // Generic fallback
  return {
    category: "generic",
    message: "Could not process your request. Check your LLM provider settings and try again.",
  };
}

function extractHttpStatus(msg) {
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}
