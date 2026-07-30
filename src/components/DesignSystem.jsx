/* eslint-disable max-lines */
import React from "react";
import { FAVICON_PLACEHOLDER, faviconSrc } from "../utils/favicon.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

// Internal Bookmarkit Design System library. Components are lifted from the
// supplied design-system source and keep native React event/ref contracts so
// the web app and Chrome popup can share presentation without sharing logic.

export function Button({
  children,
  intent = "primary",
  size = "md",
  type = "button",
  disabled = false,
  loading = false,
  fullWidth = false,
  leadingIcon = null,
  className = "",
  style = {},
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`ds-button ds-button--${intent} ds-button--${size} ${className}`}
      style={{ width: fullWidth ? "100%" : undefined, ...style }}
      {...props}
    >
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : leadingIcon}
      {children}
    </button>
  );
}

export function IconButton({
  children,
  label,
  size = "md",
  variant = "ghost",
  className = "",
  ...props
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`ds-icon-button ds-icon-button--${size} ds-icon-button--${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export const Input = React.forwardRef(function Input(
  {
    label,
    id,
    validity = "idle",
    hint,
    error,
    trailing = null,
    className = "",
    wrapperClassName = "",
    style = {},
    ...props
  },
  ref
) {
  return (
    <div className={`ds-field ${wrapperClassName}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="ds-control-wrap">
        <input
          ref={ref}
          id={id}
          className={`themed-input ds-input ds-input--${validity} ${trailing ? "ds-input--trailing" : ""} ${className}`}
          style={style}
          {...props}
        />
        {trailing && <span className="ds-input-trailing">{trailing}</span>}
      </div>
      {error ? (
        <div className="ds-field-error">{error}</div>
      ) : hint ? (
        <p className="ds-field-hint">{hint}</p>
      ) : null}
    </div>
  );
});

export const Textarea = React.forwardRef(function Textarea(
  {
    label,
    id,
    action = null,
    hint,
    mono = false,
    className = "",
    wrapperClassName = "",
    style = {},
    ...props
  },
  ref
) {
  return (
    <div className={`ds-field ${wrapperClassName}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="ds-textarea-row">
        <textarea
          ref={ref}
          id={id}
          className={`themed-input ds-textarea ${mono ? "ds-textarea--mono" : ""} ${className}`}
          style={style}
          {...props}
        />
        {action}
      </div>
      {hint && <p className="ds-field-hint">{hint}</p>}
    </div>
  );
});

export const Select = React.forwardRef(function Select(
  {
    label,
    id,
    options = [],
    hint,
    className = "",
    wrapperClassName = "",
    style = {},
    children,
    ...props
  },
  ref
) {
  const normalized = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );
  return (
    <div className={`ds-field ${wrapperClassName}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <select
        ref={ref}
        id={id}
        className={`themed-input ds-select ${className}`}
        style={style}
        {...props}
      >
        {children ||
          normalized.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>
      {hint && <p className="ds-field-hint">{hint}</p>}
    </div>
  );
});

// #24: Ratings are 0–5 integers, but stored data is not guaranteed to be one.
const clampRating = (value) => Math.min(5, Math.max(0, Math.round(Number(value)) || 0));

export function StarRating({
  value = 0,
  onChange,
  readOnly = false,
  size = 24,
  buttonSemantics = false,
}) {
  const starRefs = React.useRef([]);
  // #24: A rating can reach here as a string — a JSON import writes through what
  // the file said. Every comparison below has to agree with the fill, or the
  // control renders as rated with nothing checked and so has no tab stop at all.
  const rating = clampRating(value);
  // A radiogroup is one tab stop, so focus moves with the arrow keys instead of
  // Tab. A group of toggle buttons keeps its five natural tab stops.
  const isRadioGroup = !readOnly && !buttonSemantics;
  const focusedStar = rating === 0 ? 1 : rating;

  const select = (star) => {
    onChange?.(star);
    starRefs.current[(star === 0 ? 1 : star) - 1]?.focus();
  };

  const handleKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    // Stepping below one star clears the rating, which the pointer can already
    // do by re-activating the selected star.
    select(clampRating(rating + step));
  };

  return (
    <div
      className="ds-star-rating"
      role={readOnly ? "img" : buttonSemantics ? "group" : "radiogroup"}
      aria-label={`Rating: ${rating} of 5`}
      onKeyDown={isRadioGroup ? handleKeyDown : undefined}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= rating;
        const icon = (
          <svg
            width={size}
            height={size}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.683-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.565-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
          </svg>
        );
        if (readOnly) {
          return (
            <span key={star} className={filled ? "is-filled" : ""}>
              {icon}
            </span>
          );
        }
        return (
          <button
            key={star}
            ref={(node) => {
              starRefs.current[star - 1] = node;
            }}
            type="button"
            role={buttonSemantics ? undefined : "radio"}
            // Exactly one radio is checked, even though the fill is cumulative.
            aria-checked={buttonSemantics ? undefined : star === rating}
            aria-pressed={buttonSemantics ? filled : undefined}
            aria-label={`${star} star${star === 1 ? "" : "s"}${rating === star ? " (selected — activate to clear)" : ""}`}
            className={filled ? "is-filled" : ""}
            tabIndex={isRadioGroup && star !== focusedStar ? -1 : undefined}
            onClick={() => onChange?.(rating === star ? 0 : star)}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

export const SearchBar = React.forwardRef(function SearchBar(
  { processing = false, size = "md", className = "", wrapperClassName = "", ...props },
  ref
) {
  return (
    <div className={`ds-search-bar ds-search-bar--${size} ${wrapperClassName}`}>
      <input ref={ref} className={`themed-input ${className}`} disabled={processing} {...props} />
      {processing && <span className="ds-spinner ds-search-spinner" aria-hidden="true" />}
    </div>
  );
});

export function Tag({ children, onAccent = false, className = "", ...props }) {
  return (
    <span className={`ds-tag ${onAccent ? "ds-tag--accent" : ""} ${className}`} {...props}>
      {children}
    </span>
  );
}

export function StatusDot({ tone = "warning", size = 10, title, style = {}, ...props }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`ds-status-dot ds-status-dot--${tone}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    />
  );
}

export function Kbd({ children, className = "", ...props }) {
  return (
    <kbd className={`ds-kbd ${className}`} {...props}>
      {children}
    </kbd>
  );
}

export function BookmarkCardView({
  title,
  url,
  description,
  faviconUrl,
  rating = 0,
  tags = [],
  selected = false,
  pendingDelete = false,
  unreachable = false,
  remoteFavicons = false,
  className = "",
  ...props
}) {
  // #39: faviconSrc decides, including whether the bookmark's own icon may be
  // fetched — a stored URL can point at a third party just as easily. A broken
  // icon falls back to the inline placeholder, not to another remote request.
  const favSrc = faviconSrc(url, { storedIcon: faviconUrl, allowRemote: remoteFavicons });
  return (
    <div
      className={`ds-bookmark-card ${selected ? "is-selected" : ""} ${pendingDelete ? "is-pending-delete" : ""} ${className}`}
      role="listitem"
      tabIndex={0}
      aria-selected={selected}
      {...props}
    >
      {unreachable && (
        <StatusDot
          title="URL could not be reached"
          style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
        />
      )}
      <div className="ds-favicon-tile">
        <img
          src={favSrc}
          alt=""
          width={40}
          height={40}
          onError={(event) => {
            event.currentTarget.src = FAVICON_PLACEHOLDER;
          }}
        />
      </div>
      <div className="ds-bookmark-body">
        <h3>{title}</h3>
        <p className="ds-bookmark-url">{url}</p>
        {description && <p className="ds-bookmark-description">{description}</p>}
        {rating > 0 && <StarRating value={rating} readOnly size={14} />}
        {tags.length > 0 && (
          <div className="ds-bookmark-tags">
            {tags.map((tag) => (
              <Tag key={tag} onAccent={selected}>
                {tag}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * #27, #23: A dialog is a dialog. Escape, the focus trap, and focus restoration
 * belong to the wrapper rather than to each caller — they were copied into three
 * modals and simply missing from the rest, which is how the form, the options
 * dialog and import/export ended up with no keyboard way out.
 *
 * Escape is handled on the panel, not on the document, so the dialog holding
 * focus is the one that closes; a nested dialog does not take its parent with
 * it. Stopping propagation is what keeps the app's own Escape shortcut from also
 * firing behind an open dialog. `onScrimClick` guards both routes out when a
 * caller needs to refuse (mid-delete, unsaved edits), so it also guards Escape.
 */
export const Modal = React.forwardRef(function Modal(
  {
    title,
    children,
    footer = null,
    onClose,
    size = "md",
    role = "dialog",
    titleId,
    descriptionId,
    closeLabel = "Close",
    closeDisabled = false,
    hideClose = false,
    className = "",
    panelClassName = "",
    onScrimClick,
    ...props
  },
  ref
) {
  const generatedTitleId = React.useId();
  const resolvedTitleId = titleId || (title ? generatedTitleId : undefined);
  const panelRef = React.useRef(null);
  React.useImperativeHandle(ref, () => panelRef.current, []);
  useFocusTrap(panelRef);
  const requestClose = onScrimClick || onClose;

  return (
    <div
      className={`ds-modal-scrim ${className}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose?.();
      }}
    >
      <div
        ref={panelRef}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          requestClose?.();
        }}
        role={role}
        aria-modal="true"
        aria-labelledby={resolvedTitleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`ds-modal-panel ds-modal-panel--${size} ${panelClassName}`}
        {...props}
      >
        {(title || (onClose && !hideClose)) && (
          <div className="ds-modal-heading">
            {title && <h2 id={resolvedTitleId}>{title}</h2>}
            {onClose && !hideClose && (
              <IconButton label={closeLabel} onClick={onClose} disabled={closeDisabled}>
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IconButton>
            )}
          </div>
        )}
        <div className="ds-modal-body">{children}</div>
        {footer && <div className="ds-modal-footer">{footer}</div>}
      </div>
    </div>
  );
});

export function Banner({ tone = "info", title, children, onDismiss, className = "", ...props }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`ds-banner ds-banner--${tone} ${className}`}
      {...props}
    >
      <div className="ds-banner-content">
        {title && <p className="ds-banner-title">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function Toast({ label, actionLabel = "Undo", onAction, onDismiss, className = "" }) {
  return (
    <div role="status" className={`ds-toast ${className}`}>
      <span>{label}</span>
      {onAction && (
        <button type="button" onClick={onAction} className="ds-toast-action">
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="ds-toast-dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function AgentPlan({ steps, error = false }) {
  const list = Array.isArray(steps) ? steps : steps ? [steps] : [];
  return (
    <div role="status" className={`ds-agent-plan ${error ? "ds-agent-plan--error" : ""}`}>
      {list.length === 1 ? (
        <p>
          <strong>Agent Action:</strong> {list[0].action}
        </p>
      ) : (
        <>
          <p className="ds-agent-plan-title">Agent Plan:</p>
          <ol>
            {list.map((step, index) => (
              <li key={index}>
                <strong>{step.action}</strong>
                {step.parameters && Object.keys(step.parameters).length > 0 && (
                  <span>
                    (
                    {Object.entries(step.parameters)
                      .map(([key, value]) => `${key}: "${value}"`)
                      .join(", ")}
                    )
                  </span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description, actions }) {
  return (
    <div className="ds-empty-state">
      {icon && <div className="ds-empty-icon">{icon}</div>}
      {title && <p className="ds-empty-title">{title}</p>}
      {description && <p className="ds-empty-description">{description}</p>}
      {actions && <div className="ds-empty-actions">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs = [], active, onChange }) {
  const normalized = tabs.map((tab) =>
    typeof tab === "string" ? { value: tab, label: tab } : tab
  );
  const refs = React.useRef([]);
  const activate = (index) => {
    const tab = normalized[index];
    if (!tab) return;
    onChange?.(tab.value);
    refs.current[index]?.focus();
  };
  return (
    <div className="ds-tabs" role="tablist">
      {normalized.map((tab, index) => {
        const selected = tab.value === active;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange?.(tab.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                activate((index + 1) % normalized.length);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                activate((index - 1 + normalized.length) % normalized.length);
              } else if (event.key === "Home") {
                event.preventDefault();
                activate(0);
              } else if (event.key === "End") {
                event.preventDefault();
                activate(normalized.length - 1);
              }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
