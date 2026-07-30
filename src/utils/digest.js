// #50: What happened to the collection this week, as data.
//
// Three questions, all answerable without a model: what got saved, what never got
// opened, and what was filed too hastily to have tags. Choosing those sets is here
// and is pure; the only thing a model adds is names for the groups the week's
// additions fall into, and when there is no model the grouping falls back to what
// the bookmarks already say about themselves.
//
// That order matters. A digest whose useful half needed an API key would be a
// feature most installs never see.

import { extractJsonArray } from "../llm/jsonArray.js";
import { addedAt, findNeverOpened } from "./openHistory.js";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Per section, and per prompt. Enough to be a digest; few enough to be read. */
export const MAX_ITEMS = 30;

const MAX_THEMES = 8;
const MAX_TITLE = 60;
const MAX_SUMMARY = 200;

const newestFirst = (a, b) => addedAt(b) - addedAt(a);

/**
 * The three sets a digest is made of.
 *
 * "Never opened" and "untagged" deliberately exclude the last week: something
 * saved yesterday has not been ignored, it has been saved, and asking about it
 * would make the digest nag about its own first section.
 *
 * @param {object[]} bookmarks
 * @param {number} [now]
 * @param {{windowMs?: number, limit?: number}} [options]
 * @returns {{added: object[], neverOpened: object[], untagged: object[]}}
 */
export function digestSets(bookmarks = [], now = Date.now(), options = {}) {
  const { windowMs = WEEK_MS, limit = MAX_ITEMS } = options;
  const cutoff = now - windowMs;
  const settled = bookmarks.filter((bookmark) => addedAt(bookmark) < cutoff);

  return {
    added: bookmarks
      .filter((bookmark) => addedAt(bookmark) >= cutoff)
      .sort(newestFirst)
      .slice(0, limit),
    neverOpened: findNeverOpened(settled).slice(0, limit),
    untagged: settled
      .filter((bookmark) => !(Array.isArray(bookmark.tags) ? bookmark.tags : []).length)
      .sort((a, b) => addedAt(a) - addedAt(b))
      .slice(0, limit),
  };
}

/** Whether there is anything to say. An empty digest should not open a modal. */
export const hasDigest = (sets) =>
  Boolean(sets && (sets.added.length || sets.neverOpened.length || sets.untagged.length));

const clean = (value, max) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);

/**
 * The themes in a model's answer, keyed to bookmarks it was actually shown.
 *
 * Ids it invents are dropped and a theme left with none is dropped with them, so a
 * confident answer about bookmarks that do not exist becomes no theme rather than
 * an empty group or a lookup miss.
 *
 * @param {string} text The raw answer.
 * @param {object[]} shown The bookmarks it was asked about.
 * @returns {{title: string, summary: string, ids: string[]}[]}
 */
export function parseDigestThemes(text, shown = []) {
  const entries = extractJsonArray(text);
  if (!entries) return [];
  const allowed = new Set(shown.map((bookmark) => bookmark?.id).filter(Boolean));
  const claimed = new Set();
  const themes = [];

  for (const entry of entries) {
    const title = clean(entry?.theme ?? entry?.title, MAX_TITLE);
    const ids = (Array.isArray(entry?.ids) ? entry.ids : []).filter(
      (id) => typeof id === "string" && allowed.has(id) && !claimed.has(id)
    );
    if (!title || ids.length === 0) continue;
    ids.forEach((id) => claimed.add(id));
    themes.push({ title, summary: clean(entry?.summary, MAX_SUMMARY), ids });
    if (themes.length === MAX_THEMES) break;
  }
  return themes;
}

/**
 * Themes from what the bookmarks already say: their folder, or failing that their
 * most common tag. This is what a digest looks like with no provider configured,
 * and it is also the answer when a request fails — the sections are the valuable
 * part, and grouping is a nicety.
 */
export function fallbackThemes(bookmarks = []) {
  const groups = new Map();
  for (const bookmark of bookmarks) {
    const title = groupNameFor(bookmark);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(bookmark.id);
  }
  return [...groups.entries()]
    .map(([title, ids]) => ({ title, summary: "", ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.title.localeCompare(b.title))
    .slice(0, MAX_THEMES);
}

const groupNameFor = (bookmark) => {
  const folder = String(bookmark?.folderId ?? "").trim();
  if (folder) return folder;
  const tag = (Array.isArray(bookmark?.tags) ? bookmark.tags : []).find(Boolean);
  return tag ? String(tag) : "Everything else";
};

/**
 * The themes, plus whatever they left out.
 *
 * The section counts the week's additions and then renders them theme by theme, so
 * a bookmark no theme claimed would be counted and never shown — which happens
 * whenever grouping is capped, and whenever a model quietly omits an id. Sweeping
 * the remainder into a last group keeps the section's promise: everything saved
 * this week is in it.
 */
export function withRemainder(themes = [], added = []) {
  const claimed = new Set(themes.flatMap((theme) => theme.ids));
  const rest = added.map((bookmark) => bookmark?.id).filter((id) => id && !claimed.has(id));
  return rest.length === 0 ? themes : [...themes, { title: "Also saved", summary: "", ids: rest }];
}

/**
 * A theme's bookmarks, in the order the theme named them.
 *
 * Kept out of the modal because "which bookmarks does this group refer to" is the
 * same question the parser just answered, and the modal should not be resolving ids.
 */
export function themeItems(theme, bookmarks = []) {
  const byId = new Map(bookmarks.map((bookmark) => [bookmark?.id, bookmark]));
  return (theme?.ids || []).map((id) => byId.get(id)).filter(Boolean);
}
