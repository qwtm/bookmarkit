// ARCH-06, PERF-08: Pure bookmark filter/sort/limit functions extracted from BookmarkApp.jsx.
// No React or DOM dependencies — independently testable.
// PERF-08: Defined outside the component so references are stable across renders.

import { findBrokenLinks } from "./linkHealth.js";
import { mergeSemanticMatches } from "./semanticSearch.js";

export const searchBookmarks = (searchTerm, list) => {
  const lower = (searchTerm || "").toLowerCase();
  if (!lower) return list;
  return list.filter(
    (b) =>
      (b.title?.toLowerCase() || "").includes(lower) ||
      (b.url?.toLowerCase() || "").includes(lower) ||
      (b.description?.toLowerCase() || "").includes(lower) ||
      (b.tags && b.tags.some((tag) => tag.toLowerCase().includes(lower)))
  );
};

// The single normalization rule for tag equality. Tags reach the store unnormalized — JSON import
// passes `tags` straight through, and the agent can emit whatever the LLM produced — so both sides
// of every comparison must be normalized identically. deriveTagCounts (manualFilters.js) builds the
// chip facets with this same function, which is what keeps a chip's count and the result of
// clicking it in agreement (Codex, #58).
export const normalizeTag = (tag) => (tag ?? "").toString().trim().toLowerCase();

export const findWithTags = (includeTags = [], excludeTags = [], list) => {
  // Blank query tags are dropped rather than compared: an empty include would otherwise match
  // nothing and silently blank the view.
  const lowerInclude = includeTags.map(normalizeTag).filter(Boolean);
  const lowerExclude = excludeTags.map(normalizeTag).filter(Boolean);
  return list.filter((b) => {
    const bookmarkTags = Array.isArray(b.tags) ? b.tags.map(normalizeTag) : [];
    return (
      lowerInclude.every((tag) => bookmarkTags.includes(tag)) &&
      !lowerExclude.some((tag) => bookmarkTags.includes(tag))
    );
  });
};

export const findIncludes = (field, value, list) => {
  const lowerValue = (value || "").toLowerCase();
  return list.filter((b) => ((b[field] || "") + "").toLowerCase().includes(lowerValue));
};

export const findStartsWith = (field, value, list) => {
  const lowerValue = (value || "").toLowerCase();
  return list.filter((b) => {
    if (field === "tags") {
      const tags = Array.isArray(b.tags) ? b.tags : [];
      return tags.some((t) => (t || "").toString().toLowerCase().startsWith(lowerValue));
    }
    const val = ((b[field] ?? "") + "").toLowerCase();
    return lowerValue ? val.startsWith(lowerValue) : true;
  });
};

export const filterByRating = (params = {}, list) => {
  const { minRating, maxRating, comparator, exact } = params || {};
  const hasExact = typeof exact === "number" || comparator === "eq";
  const min = hasExact
    ? (typeof exact === "number" ? exact : minRating) || 0
    : typeof minRating === "number"
      ? minRating
      : 0;
  const max = hasExact ? min : typeof maxRating === "number" ? maxRating : 5;
  return list.filter((b) => {
    const r = b.rating || 0;
    if (comparator === "gte") return r >= min;
    if (comparator === "lte") return r <= min;
    if (comparator === "eq" || hasExact) return r === min;
    return r >= min && r <= max;
  });
};

export const sortBookmarks = (sortBy, order, list) => {
  const ord = (order || "asc").toLowerCase();
  return [...list].sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];
    if (valA === undefined || valA === null) valA = "";
    if (valB === undefined || valB === null) valB = "";
    if (typeof valA === "number" && typeof valB === "number") {
      return ord === "asc" ? valA - valB : valB - valA;
    }
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    if (ord === "asc") return valA < valB ? -1 : valA > valB ? 1 : 0;
    return valA > valB ? -1 : valA < valB ? 1 : 0;
  });
};

export const limitResults = (count, list, direction = "first") => {
  const n = Number(count) || 0;
  if (!n || n <= 0) return list;
  return direction === "last" ? list.slice(-n) : list.slice(0, n);
};

const RESET_ACTIONS = ["resetSearch", "showAllBookmarks"];

// #21: Order steps by their numeric `priority` (lower runs first), falling back
// to original array order for ties or when no step declares a priority. Shared
// by applyAgentPlan (display) and the agent's imperative side-effect loop so
// both honor the ordering the LLM was asked to produce.
export const sortStepsByPriority = (steps = []) => {
  const list = Array.isArray(steps) ? steps : [steps];
  if (!list.some((s) => typeof s?.priority === "number")) return list;
  return list
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => a.s.priority - b.s.priority || a.idx - b.idx)
    .map((x) => x.s);
};

// #20: Merge a newly parsed plan into the accumulated one. New steps replace any
// prior step with the same action (so re-searching a different term does not
// stack on top of the old filter), while steps of a different action still
// refine the view. A reset/showAll clears the accumulated plan. This bounds the
// plan to at most one step per action instead of growing without limit.
export const mergeAgentPlan = (previous = [], steps = []) => {
  const prev = Array.isArray(previous) ? previous : previous ? [previous] : [];
  if (steps.some((s) => RESET_ACTIONS.includes(s.action))) return steps;
  // Replace a same-action prior step *in its original slot* so execution order
  // (which matters when steps carry no numeric priority) is preserved; only
  // genuinely new actions are appended. Each action ends up exactly once —
  // extra duplicate slots in `previous` and repeated incoming actions are
  // collapsed, keeping the one-step-per-action bound (Codex #32).
  const replacement = new Map(steps.map((s) => [s.action, s])); // last wins per action
  const placed = new Set();
  const merged = [];
  for (const s of prev) {
    if (replacement.has(s.action)) {
      if (!placed.has(s.action)) {
        placed.add(s.action);
        merged.push(replacement.get(s.action)); // first matching slot only
      }
      // drop additional stale duplicate slots for this action
    } else {
      merged.push(s);
    }
  }
  for (const s of steps) {
    if (!placed.has(s.action)) {
      placed.add(s.action);
      merged.push(replacement.get(s.action));
    }
  }
  return merged;
};

/**
 * The actions that shape what the list shows. Everything else a plan can contain
 * — importing, exporting, de-duplicating, persisting an order — is a side effect
 * the app carries out once, and contributes nothing to the projection.
 *
 * Named because two callers need the same answer: this function skips the rest,
 * and a saved view (#49) keeps only these, since a view is a lens over the list
 * rather than a script to re-run.
 */
export const DISPLAY_ACTIONS = new Set([
  "searchBookmarks",
  "semanticMatches",
  "findIncludes",
  "findStartsWith",
  "findWithTags",
  "filterByRating",
  "findBrokenLinks",
  "sortBookmarks",
  "limitResults",
  "limitFirst",
  "limitLast",
]);

// PERF-08: applyAgentPlan is a pure function — given the same plan + list it always
// returns the same reference-equal result when inputs are stable.
export const applyAgentPlan = (plan, list) => {
  if (!plan) return list;
  const actions = Array.isArray(plan) ? plan : [plan];
  const ordered = sortStepsByPriority(actions);
  let currentResults = [...list];
  for (const step of ordered) {
    const { action, parameters = {} } = step;
    if (!DISPLAY_ACTIONS.has(action)) continue;
    switch (action) {
      case "searchBookmarks":
        currentResults = searchBookmarks(parameters.searchTerm || "", currentResults);
        break;
      // #46: a search the app widened with vector matches. It carries its own
      // search term rather than layering onto a `searchBookmarks` step, because
      // the widening has to see what substring matching filtered out.
      //
      // The parser's whitelist does not include it: this step is written by the
      // app from a local ranking, never by a model.
      case "semanticMatches":
        currentResults = mergeSemanticMatches(
          searchBookmarks(parameters.searchTerm || "", currentResults),
          currentResults,
          Array.isArray(parameters.ids) ? parameters.ids : []
        );
        break;
      case "findIncludes":
        currentResults = findIncludes(
          parameters.field || "title",
          parameters.value || "",
          currentResults
        );
        break;
      case "findStartsWith":
        currentResults = findStartsWith(
          parameters.field || "title",
          parameters.value || "",
          currentResults
        );
        break;
      case "findWithTags":
        currentResults = findWithTags(
          parameters.includeTags || [],
          parameters.excludeTags || [],
          currentResults
        );
        break;
      case "findBrokenLinks":
        currentResults = findBrokenLinks(currentResults);
        break;
      case "filterByRating":
        currentResults = filterByRating(parameters || {}, currentResults);
        break;
      case "sortBookmarks":
        currentResults = sortBookmarks(
          parameters.sortBy || "title",
          parameters.order || "asc",
          currentResults
        );
        break;
      case "limitResults":
        currentResults = limitResults(
          Number(parameters.count) || 0,
          parameters.scope === "all" ? list : currentResults,
          parameters.direction || "first"
        );
        break;
      case "limitFirst":
        currentResults = limitResults(Number(parameters.count) || 0, currentResults, "first");
        break;
      case "limitLast":
        currentResults = limitResults(Number(parameters.count) || 0, currentResults, "last");
        break;
      default:
        break;
    }
  }
  return currentResults;
};
