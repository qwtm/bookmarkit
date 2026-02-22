// ARCH-06: Individual bookmark card extracted from BookmarkApp.jsx.
// PERF-06, PERF-09: Wrapped in React.memo to skip re-renders when props haven't changed.

import React from "react";

const BookmarkCard = React.memo(function BookmarkCard({
  bookmark,
  isSelected,
  isMultiSelected,
  isPendingDelete,
  onClick,
  onDoubleClick,
  onKeyDown,
}) {
  const isActive = isSelected || isMultiSelected;
  const isInvalid = bookmark.urlStatus === "invalid" || bookmark.unreachable;

  const containerClass = [
    "relative rounded-lg border p-4 transition-all duration-200 cursor-pointer",
    isPendingDelete
      ? "bg-red-50 border-red-300"
      : isActive
        ? "bg-accent border-accent text-white"
        : isInvalid
          ? "bg-yellow-100 border-yellow-300"
          : "bg-primary-bg border-border hover:border-accent hover:shadow-sm",
  ].join(" ");

  return (
    <div
      className={containerClass}
      role="listitem"
      aria-selected={isActive}
      tabIndex={0}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-secondary-bg rounded">
          <img
            src={
              bookmark.faviconUrl ||
              `https://www.google.com/s2/favicons?domain=${bookmark.url}&sz=32`
            }
            alt=""
            className="w-full h-full object-contain rounded"
            onError={(e) => {
              e.currentTarget.src = "https://placehold.co/32x32/f0f0f0/999999?text=?";
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={`text-base font-medium truncate ${isActive ? "text-white" : "text-primary-text"}`}
          >
            {bookmark.title}
          </h3>
          <p
            className={`text-sm truncate ${isActive ? "text-white opacity-90" : "text-accent hover:text-accent-hover"}`}
          >
            {bookmark.url}
          </p>
          {bookmark.description && (
            <p
              className={`text-sm mt-1 ${isActive ? "text-white opacity-80" : "text-secondary-text"}`}
            >
              {bookmark.description}
            </p>
          )}
          {bookmark.rating > 0 && (
            <div className="text-xs text-yellow-400 mt-1">
              {"★".repeat(bookmark.rating)}{"☆".repeat(5 - bookmark.rating)}
            </div>
          )}
          {bookmark.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {bookmark.tags.map((tag) => (
                <span
                  key={tag}
                  className={`text-xs px-2 py-0.5 rounded-full ${isActive ? "bg-white bg-opacity-20 text-white" : "bg-secondary-bg text-secondary-text"}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default BookmarkCard;
