// ARCH-06, PERF-06: Virtualized bookmark list using react-window FixedSizeList.
// Only renders visible rows, allowing 1000+ bookmarks without DOM bloat.
// ARCH-10: Renders contextual empty states depending on loading/search/results state.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VariableSizeList } from "react-window";
import BookmarkCard from "./BookmarkCard.jsx";
import FilterBar from "./FilterBar.jsx";
import { Button, EmptyState as DesignEmptyState } from "./DesignSystem.jsx";

const ITEM_HEIGHT = 104; // px — initial card-row estimate before measurement
const FILTER_ROW_GAP = 16; // px — mirrors the filter panel's mb-4 spacing

// ARCH-10: Three distinct empty states
function EmptyState({
  isLoading,
  bookmarksTotal,
  searchActive,
  lastAction,
  searchQuery,
  onClear,
  onAddNew,
  onImport,
}) {
  if (isLoading) return null;

  if (bookmarksTotal === 0) {
    return (
      <DesignEmptyState
        icon={
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
        }
        title="No bookmarks yet."
        description={'Click "Add New" to get started or import from a browser export.'}
        actions={
          <>
            <Button onClick={onAddNew}>Add New</Button>
            <Button intent="secondary" onClick={onImport}>
              Import
            </Button>
          </>
        }
      />
    );
  }

  if (lastAction) {
    return (
      <DesignEmptyState
        icon={
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        }
        title="No bookmarks match your request."
        actions={
          <Button intent="ghost" onClick={onClear}>
            Clear search
          </Button>
        }
      />
    );
  }

  if (searchActive) {
    return (
      <DesignEmptyState
        icon={
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        }
        title={`No bookmarks match${searchQuery ? ` "${searchQuery}"` : " your search"}.`}
        actions={
          <Button intent="ghost" onClick={onClear}>
            Clear search
          </Button>
        }
      />
    );
  }

  return null;
}

// renderRow is defined outside the component so its reference is always stable.
// react-window uses the children prop as the component *type* via createElement —
// if the function reference changes between clicks React unmounts/remounts the row
// DOM nodes, which causes the browser to lose double-click tracking. By keeping
// renderRow stable and passing all changing state through itemData we avoid this.
function FilterRow({ style, data }) {
  const measureRef = useRef(null);
  const { onFilterHeightChange } = data;

  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const updateHeight = () => onFilterHeightChange(Math.ceil(element.scrollHeight));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onFilterHeightChange]);

  return (
    <div style={style} role="presentation">
      <div ref={measureRef} style={{ paddingBottom: FILTER_ROW_GAP }}>
        <FilterBar
          filters={data.filters}
          tagFacets={data.tagFacets}
          onChange={data.onFilterChange}
          onCycleTag={data.onCycleTag}
          onClear={data.onClearFilters}
          summary={data.filterSummary}
          style={{ marginBottom: 0 }}
        />
      </div>
    </div>
  );
}

function BookmarkRow({ index, style, data }) {
  const measureRef = useRef(null);
  const {
    bookmarks,
    selectedBookmarkId,
    multiSelectedBookmarkIds,
    bookmarksToDelete,
    onBookmarkClick,
    onBookmarkDoubleClick,
    onBookmarkKeyDown,
    onBookmarkDragStart,
    onRowHeightChange,
    remoteFavicons,
  } = data;
  const bookmark = bookmarks[index - 1];

  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const updateHeight = () =>
      onRowHeightChange(index, bookmark.id, Math.ceil(element.scrollHeight));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bookmark.id, index, onRowHeightChange]);

  return (
    <div style={style}>
      <div ref={measureRef} style={{ paddingBottom: 8 }}>
        <BookmarkCard
          bookmark={bookmark}
          isSelected={selectedBookmarkId === bookmark.id}
          isMultiSelected={multiSelectedBookmarkIds.includes(bookmark.id)}
          isPendingDelete={bookmarksToDelete.includes(bookmark.id)}
          remoteFavicons={remoteFavicons}
          onClick={(e) => onBookmarkClick(bookmark, e)}
          onDoubleClick={() => onBookmarkDoubleClick(bookmark)}
          onKeyDown={(e) => onBookmarkKeyDown(e, bookmark)}
          onDragStart={onBookmarkDragStart && ((e) => onBookmarkDragStart(e, bookmark))}
        />
      </div>
    </div>
  );
}

function renderRow({ index, style, data }) {
  return index === 0 ? (
    <FilterRow style={style} data={data} />
  ) : (
    <BookmarkRow index={index} style={style} data={data} />
  );
}

function itemKey(index, data) {
  return index === 0 ? "bookmark-filters" : data.bookmarks[index - 1].id;
}

const VirtualizedListInner = React.forwardRef(function VirtualizedListInner(
  { children, style },
  ref
) {
  const rows = React.Children.toArray(children);
  const filterRow = rows.find((row) => row.props.index === 0);
  const bookmarkRows = rows.filter((row) => row.props.index !== 0);

  return (
    <div ref={ref} style={style}>
      {filterRow}
      <div role="list" aria-label="Bookmarks">
        {bookmarkRows}
      </div>
    </div>
  );
});

const BookmarkList = React.memo(function BookmarkList({
  bookmarks,
  selectedBookmarkId,
  multiSelectedBookmarkIds,
  bookmarksToDelete,
  onBookmarkClick,
  onBookmarkDoubleClick,
  onBookmarkKeyDown,
  onBookmarkDragStart,
  // empty state props
  isLoading,
  bookmarksTotal,
  searchActive,
  lastAction,
  searchQuery,
  onClearSearch,
  onAddNew,
  onImport,
  filters,
  tagFacets,
  onFilterChange,
  onCycleTag,
  onClearFilters,
  filterSummary,
  remoteFavicons,
}) {
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const rowHeightsRef = useRef(new Map());
  const [listHeight, setListHeight] = useState(500);
  const [filterHeight, setFilterHeight] = useState(136);
  const bookmarkOrder = useMemo(
    () => bookmarks.map((bookmark) => bookmark.id).join("\u0000"),
    [bookmarks]
  );

  // Measure container height so FixedSizeList fills the available space.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      if (h > 0) setListHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [bookmarkOrder, filterHeight]);

  const handleFilterHeightChange = useCallback((height) => {
    setFilterHeight((current) => (current === height ? current : height));
  }, []);

  const handleRowHeightChange = useCallback((index, bookmarkId, height) => {
    if (rowHeightsRef.current.get(bookmarkId) === height) return;
    rowHeightsRef.current.set(bookmarkId, height);
    listRef.current?.resetAfterIndex(index);
  }, []);

  // Pack all row-level state into itemData so renderRow (stable ref) can read it.
  const itemData = useMemo(
    () => ({
      bookmarks,
      selectedBookmarkId,
      multiSelectedBookmarkIds,
      bookmarksToDelete,
      onBookmarkClick,
      onBookmarkDoubleClick,
      onBookmarkKeyDown,
      onBookmarkDragStart,
      filters,
      tagFacets,
      onFilterChange,
      onCycleTag,
      onClearFilters,
      filterSummary,
      remoteFavicons,
      onFilterHeightChange: handleFilterHeightChange,
      onRowHeightChange: handleRowHeightChange,
    }),
    [
      bookmarks,
      selectedBookmarkId,
      multiSelectedBookmarkIds,
      bookmarksToDelete,
      onBookmarkClick,
      onBookmarkDoubleClick,
      onBookmarkKeyDown,
      onBookmarkDragStart,
      filters,
      tagFacets,
      onFilterChange,
      onCycleTag,
      onClearFilters,
      filterSummary,
      remoteFavicons,
      handleFilterHeightChange,
      handleRowHeightChange,
    ]
  );

  if (bookmarks.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <FilterBar
          filters={filters}
          tagFacets={tagFacets}
          onChange={onFilterChange}
          onCycleTag={onCycleTag}
          onClear={onClearFilters}
          summary={filterSummary}
        />
        <EmptyState
          isLoading={isLoading}
          bookmarksTotal={bookmarksTotal}
          searchActive={searchActive}
          lastAction={lastAction}
          searchQuery={searchQuery}
          onClear={onClearSearch}
          onAddNew={onAddNew}
          onImport={onImport}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height: "100%" }}>
      <VariableSizeList
        ref={listRef}
        height={listHeight}
        innerElementType={VirtualizedListInner}
        itemCount={bookmarks.length + 1}
        itemSize={(index) =>
          index === 0
            ? filterHeight
            : rowHeightsRef.current.get(bookmarks[index - 1].id) || ITEM_HEIGHT
        }
        itemData={itemData}
        itemKey={itemKey}
        width="100%"
        overscanCount={5}
        style={{ overflowX: "hidden" }}
      >
        {renderRow}
      </VariableSizeList>
    </div>
  );
});

export default BookmarkList;
