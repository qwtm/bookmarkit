// ARCH-06, PERF-06: Virtualized bookmark list using react-window FixedSizeList.
// Only renders visible rows, allowing 1000+ bookmarks without DOM bloat.
// ARCH-10: Renders contextual empty states depending on loading/search/results state.

import React, { useCallback, useRef } from "react";
import { List as FixedSizeList } from "react-window";
import BookmarkCard from "./BookmarkCard.jsx";

const ITEM_HEIGHT = 104; // px — approximate card height

// ARCH-10: Three distinct empty states
function EmptyState({ isLoading, bookmarksTotal, searchActive, lastAction, searchQuery, onClear, onAddNew, onImport }) {
  if (isLoading) return null;

  if (bookmarksTotal === 0) {
    return (
      <div className="text-center py-16 px-4">
        <svg className="mx-auto mb-4 text-secondary-text" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
        <p className="text-secondary-text font-medium mb-2">No bookmarks yet.</p>
        <p className="text-secondary-text text-sm mb-4">Click &quot;Add New&quot; to get started or import from a browser export.</p>
        <div className="flex justify-center gap-3">
          <button onClick={onAddNew} className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent-hover">Add New</button>
          <button onClick={onImport} className="px-4 py-2 bg-secondary-bg text-primary-text text-sm rounded-md border border-border hover:bg-border">Import</button>
        </div>
      </div>
    );
  }

  if (lastAction) {
    return (
      <div className="text-center py-12 px-4">
        <svg className="mx-auto mb-4 text-secondary-text" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p className="text-secondary-text mb-2">No bookmarks match your request.</p>
        <button onClick={onClear} className="mt-1 text-accent hover:underline text-sm">Clear search</button>
      </div>
    );
  }

  if (searchActive) {
    return (
      <div className="text-center py-12 px-4">
        <svg className="mx-auto mb-4 text-secondary-text" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p className="text-secondary-text mb-2">
          No bookmarks match{searchQuery ? ` "${searchQuery}"` : " your search"}.
        </p>
        <button onClick={onClear} className="mt-1 text-accent hover:underline text-sm">Clear search</button>
      </div>
    );
  }

  return null;
}

const BookmarkList = React.memo(function BookmarkList({
  bookmarks,
  selectedBookmarkId,
  multiSelectedBookmarkIds,
  bookmarksToDelete,
  onBookmarkClick,
  onBookmarkDoubleClick,
  onBookmarkKeyDown,
  // empty state props
  isLoading,
  bookmarksTotal,
  searchActive,
  lastAction,
  searchQuery,
  onClearSearch,
  onAddNew,
  onImport,
}) {
  const listRef = useRef(null);

  const renderRow = useCallback(
    ({ index, style }) => {
      const bookmark = bookmarks[index];
      return (
        <div style={{ ...style, paddingBottom: 8 }}>
          <BookmarkCard
            bookmark={bookmark}
            isSelected={selectedBookmarkId === bookmark.id}
            isMultiSelected={multiSelectedBookmarkIds.includes(bookmark.id)}
            isPendingDelete={bookmarksToDelete.includes(bookmark.id)}
            onClick={(e) => onBookmarkClick(bookmark, e)}
            onDoubleClick={() => onBookmarkDoubleClick(bookmark)}
            onKeyDown={(e) => onBookmarkKeyDown(e, bookmark)}
          />
        </div>
      );
    },
    [bookmarks, selectedBookmarkId, multiSelectedBookmarkIds, bookmarksToDelete, onBookmarkClick, onBookmarkDoubleClick, onBookmarkKeyDown],
  );

  if (bookmarks.length === 0) {
    return (
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
    );
  }

  return (
    <div role="list" aria-label="Bookmarks">
      <FixedSizeList
        ref={listRef}
        height={Math.min(bookmarks.length * ITEM_HEIGHT, 600)}
        itemCount={bookmarks.length}
        itemSize={ITEM_HEIGHT}
        width="100%"
        overscanCount={5}
        style={{ overflowX: "hidden" }}
      >
        {renderRow}
      </FixedSizeList>
    </div>
  );
});

export default BookmarkList;
