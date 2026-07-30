// #49: A saved view is data, and data from storage is not trusted.
//
// A view is a name over what is already on screen: the agent's plan, the manual
// filters, or both. Both were serializable and both were applied by pure
// functions, so saving one is persistence rather than a new capability.
//
// The load path is the interesting half. What comes back out of storage may have
// been hand-edited, imported, or written by a newer version, so a stored plan is
// read the same way a model's answer is: as untrusted text, through
// `parseAgentResponse`, which drops any action not on its whitelist. Nothing here
// can put an unknown action into `applyAgentPlan`.

import { parseAgentResponse } from "../llm/parser.js";
import { DISPLAY_ACTIONS } from "./bookmarkFilters.js";
import { EMPTY_FILTERS, hasActiveFilters, isSortableField } from "./manualFilters.js";

// Enough for the views a person actually returns to; a cap so a bug cannot grow
// the stored blob without bound.
export const MAX_VIEWS = 50;

const MAX_NAME = 60;

const asName = (value) =>
  String(value ?? "")
    .trim()
    .slice(0, MAX_NAME);

const asTagList = (value) =>
  Array.isArray(value) ? value.map((tag) => String(tag ?? "")).filter(Boolean) : [];

const asRating = (value) => {
  const rating = Math.trunc(Number(value));
  return Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0;
};

/** Only the filter keys the app knows, coerced to the shapes it expects. */
function sanitizeFilters(raw) {
  if (!raw || typeof raw !== "object") return { ...EMPTY_FILTERS };
  return {
    text: String(raw.text ?? ""),
    includeTags: asTagList(raw.includeTags),
    excludeTags: asTagList(raw.excludeTags),
    minRating: asRating(raw.minRating),
    brokenOnly: raw.brokenOnly === true,
    sortBy: isSortableField(raw.sortBy) ? raw.sortBy : "",
    order: raw.order === "desc" ? "desc" : "asc",
  };
}

/**
 * A stored plan, back through the whitelist it came in by.
 *
 * `parseAgentResponse` takes text, which is exactly what this is: the plan is
 * re-serialized so an object smuggled into storage gets no shortcut past the
 * validation an LLM's answer goes through.
 *
 * Only the steps that shape the list survive. A view is a lens, so importing,
 * exporting, de-duplicating and persisting an order have no business in one:
 * applying a view sets the plan and the filters, and nothing replays a side
 * effect. Keeping them would mean a chip that either does nothing or, worse,
 * leaves a persistSortedOrder step lying in the plan for a later reorder to find.
 */
function sanitizePlan(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  try {
    return parseAgentResponse(JSON.stringify(raw)).filter((step) =>
      DISPLAY_ACTIONS.has(step.action)
    );
  } catch {
    return [];
  }
}

/**
 * One stored view, or null when nothing usable is left of it — an unnamed view,
 * or one whose plan was entirely unknown actions and whose filters were empty.
 */
export function sanitizeView(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = asName(raw.name);
  if (!name) return null;
  const plan = sanitizePlan(raw.plan);
  const filters = sanitizeFilters(raw.filters);
  if (plan.length === 0 && !hasActiveFilters(filters)) return null;
  return { id: String(raw.id || crypto.randomUUID()), name, plan, filters };
}

/**
 * Views as stored, ready to use. Anything unreadable is dropped rather than
 * throwing: a corrupt entry should cost its own chip, not the whole row.
 *
 * @param {string|unknown} stored The raw storage value.
 * @returns {{id: string, name: string, plan: object[], filters: object}[]}
 */
export function readViews(stored) {
  let parsed = stored;
  if (typeof stored === "string") {
    try {
      parsed = JSON.parse(stored);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const views = [];
  const names = new Set();
  for (const raw of parsed) {
    const view = sanitizeView(raw);
    // Names are how a view is referred to, so two of them cannot share one.
    if (!view || names.has(view.name.toLowerCase())) continue;
    names.add(view.name.toLowerCase());
    views.push(view);
    if (views.length >= MAX_VIEWS) break;
  }
  return views;
}

export const serializeViews = (views) => JSON.stringify(views ?? []);

/**
 * Whether what is on screen is worth saving. A view that restores nothing is a
 * chip that does nothing.
 */
export const isViewWorthSaving = (plan, filters) => {
  const steps = Array.isArray(plan) ? plan : plan ? [plan] : [];
  return steps.some((step) => DISPLAY_ACTIONS.has(step?.action)) || hasActiveFilters(filters);
};

/**
 * A cached ranking is not a query. #46's `semanticMatches` step carries the ids a
 * vector search returned, which describe one moment: bookmarks get added, edited
 * and deleted, and a view that replayed last week's ranking would quietly show the
 * wrong answer. Saved as the query it came from, so applying the view searches
 * again instead of remembering.
 */
const asQuery = (step) =>
  step?.action === "semanticMatches"
    ? { action: "searchBookmarks", parameters: { searchTerm: step.parameters?.searchTerm || "" } }
    : step;

/**
 * A view of the current screen, sanitized on the way in as well as out — the app
 * holds a plan the parser already vetted, but a name is user input.
 */
export function makeView(name, plan, filters) {
  const steps = Array.isArray(plan) ? plan : plan ? [plan] : [];
  return sanitizeView({
    id: crypto.randomUUID(),
    name,
    plan: steps.map(asQuery),
    filters,
  });
}

/**
 * Add a view, replacing one of the same name rather than accumulating duplicates,
 * and dropping the oldest once full.
 */
export function addView(views, view) {
  if (!view) return views;
  const kept = (views || []).filter((v) => v.name.toLowerCase() !== view.name.toLowerCase());
  return [view, ...kept].slice(0, MAX_VIEWS);
}

export const removeView = (views, id) => (views || []).filter((view) => view.id !== id);

/** Two plans or two filter sets are the same when they would narrow the same way. */
const sameShape = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The saved view the screen currently matches, if any.
 *
 * Derived rather than remembered, so changing a filter after clicking a chip
 * visibly leaves that view instead of leaving it highlighted.
 *
 * @returns {string|null} the view's id.
 */
export function matchingViewId(views, plan, filters) {
  const currentPlan = (Array.isArray(plan) ? plan : plan ? [plan] : []).map(asQuery);
  const currentFilters = sanitizeFilters(filters);
  const match = (views || []).find(
    (view) => sameShape(view.plan, currentPlan) && sameShape(view.filters, currentFilters)
  );
  return match?.id ?? null;
}
