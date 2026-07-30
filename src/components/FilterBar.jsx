// #53: Deterministic filter controls — the LLM-free path to filtering/sorting.
// Everything here is local: no network, no provider, no API key. The agent bar is a
// convenience layer on top of these same primitives, not a prerequisite for them.

import React, { useMemo, useState } from "react";
import { SORT_FIELDS, TAG_STATE, getTagState, hasActiveFilters } from "../utils/manualFilters.js";
import { Button, Input, Select } from "./DesignSystem.jsx";

const VISIBLE_TAG_LIMIT = 12;

function TagChip({ tag, count, state, onClick }) {
  const base =
    "px-2 py-0.5 text-xs rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent";
  const styles = {
    [TAG_STATE.INCLUDE]: "bg-accent text-white border-accent",
    [TAG_STATE.EXCLUDE]:
      "bg-secondary-bg text-secondary-text border-border line-through opacity-70",
    [TAG_STATE.OFF]: "bg-primary-bg text-primary-text border-border hover:bg-secondary-bg",
  };
  const hint = {
    [TAG_STATE.INCLUDE]: "including",
    [TAG_STATE.EXCLUDE]: "excluding",
    [TAG_STATE.OFF]: "not filtered",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${styles[state]}`}
      // Chips are tri-state, so aria-pressed (binary) would misreport "exclude".
      // Spell the state out for screen readers instead.
      aria-label={`Tag ${tag}, ${count} bookmark${count === 1 ? "" : "s"}, ${hint[state]}. Activate to cycle include, exclude, off.`}
    >
      {state === TAG_STATE.EXCLUDE ? "−" : ""}
      {tag}
      <span className="ml-1 opacity-60">{count}</span>
    </button>
  );
}

const FilterBar = React.memo(function FilterBar({
  filters,
  tagFacets,
  onChange,
  onCycleTag,
  onClear,
  summary,
  style,
}) {
  const [showAllTags, setShowAllTags] = useState(false);

  const visibleTags = useMemo(
    () => (showAllTags ? tagFacets : tagFacets.slice(0, VISIBLE_TAG_LIMIT)),
    [tagFacets, showAllTags]
  );

  const active = hasActiveFilters(filters);
  const hiddenCount = tagFacets.length - visibleTags.length;

  return (
    <div
      className="mb-4 p-3 rounded-lg border border-border bg-primary-bg"
      style={style}
      role="search"
      aria-label="Filter bookmarks"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[13.75rem]">
          <Input
            id="filter-text"
            type="text"
            value={filters.text}
            onChange={(e) => onChange({ ...filters, text: e.target.value })}
            placeholder="Filter instantly (no AI)…"
            aria-label="Filter bookmarks by text"
          />
          {filters.text && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, text: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-text hover:text-primary-text focus:outline-none focus:ring-2 focus:ring-accent rounded"
              aria-label="Clear text filter"
            >
              ✕
            </button>
          )}
        </div>

        <Select
          id="filter-rating"
          value={filters.minRating}
          onChange={(e) => onChange({ ...filters, minRating: Number(e.target.value) })}
          aria-label="Minimum rating"
          wrapperClassName="w-[9.375rem]"
          options={[
            { value: 0, label: "Any rating" },
            ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${"★".repeat(n)}+` })),
          ]}
        />

        {/* #47: what the sweep found, as a filter — the status it reads is written
            by the link check, so this stays useful with no LLM and no network. */}
        <Button
          type="button"
          intent={filters.brokenOnly ? "primary" : "secondary"}
          onClick={() => onChange({ ...filters, brokenOnly: !filters.brokenOnly })}
          aria-pressed={Boolean(filters.brokenOnly)}
        >
          Broken only
        </Button>

        <Select
          id="filter-sort"
          value={filters.sortBy}
          onChange={(e) => onChange({ ...filters, sortBy: e.target.value })}
          aria-label="Sort by"
          wrapperClassName="w-[10.625rem]"
          options={SORT_FIELDS}
        />

        <Button
          type="button"
          intent="secondary"
          onClick={() => onChange({ ...filters, order: filters.order === "asc" ? "desc" : "asc" })}
          disabled={!filters.sortBy}
          aria-label={`Sort direction: ${filters.order === "asc" ? "ascending" : "descending"}. Activate to reverse.`}
        >
          {filters.order === "asc" ? "↑ Asc" : "↓ Desc"}
        </Button>

        {active && (
          <Button type="button" intent="ghost" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>

      {tagFacets.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {visibleTags.map(({ tag, count }) => (
            <TagChip
              key={tag}
              tag={tag}
              count={count}
              state={getTagState(filters, tag)}
              onClick={() => onCycleTag(tag)}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllTags(true)}
              className="px-2 py-0.5 text-xs rounded-full border border-border text-secondary-text hover:bg-secondary-bg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              +{hiddenCount} more
            </button>
          )}
          {showAllTags && tagFacets.length > VISIBLE_TAG_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllTags(false)}
              className="px-2 py-0.5 text-xs rounded-full border border-border text-secondary-text hover:bg-secondary-bg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              Show fewer
            </button>
          )}
        </div>
      )}

      {summary && (
        <div className="mt-3 pt-3 border-t border-border text-sm text-secondary-text">
          {summary}
        </div>
      )}
    </div>
  );
});

export default FilterBar;
