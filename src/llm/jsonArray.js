// A JSON array in a model's reply, however it was wrapped.
//
// Models fence their JSON, preface it with "Here you go:", or answer with prose
// containing an array — so the array is located rather than assumed, and anything
// that does not parse into one is `null`. Two callers read answers this shape
// (#44's proposals and #50's themes) and both treat a bad answer as no answer, so
// the tolerance lives here rather than twice.
//
// Plans are not read with this: `parser.js` has its own reader, because a plan is
// validated action by action against a whitelist.

/**
 * @param {unknown} text
 * @returns {unknown[]|null}
 */
export function extractJsonArray(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/iu);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
