// ARCH-06: Individual bookmark card extracted from BookmarkApp.jsx.
// PERF-06, PERF-09: Wrapped in React.memo to skip re-renders when props haven't changed.

import React from "react";
import { BookmarkCardView } from "./DesignSystem.jsx";

const BookmarkCard = React.memo(function BookmarkCard({
  bookmark,
  isSelected,
  isMultiSelected,
  isPendingDelete,
  remoteFavicons,
  onClick,
  onDoubleClick,
  onKeyDown,
  onDragStart,
}) {
  const isActive = isSelected || isMultiSelected;
  const isInvalid = bookmark.urlStatus === "invalid" || bookmark.unreachable;

  return (
    <BookmarkCardView
      title={bookmark.title}
      url={bookmark.url}
      description={bookmark.description}
      faviconUrl={bookmark.faviconUrl}
      rating={bookmark.rating}
      tags={bookmark.tags}
      selected={isActive}
      pendingDelete={isPendingDelete}
      unreachable={isInvalid}
      remoteFavicons={remoteFavicons}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      // #55: a card is draggable only where there is somewhere to drop it.
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
    />
  );
});

export default BookmarkCard;
