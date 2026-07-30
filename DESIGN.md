# Bookmarkit design

Bookmarkit is a client-first bookmark manager delivered as a Vite/React web
build and a Chrome Manifest V3 extension. This document records the boundaries
that are costly to rediscover from individual files; component-level behavior
belongs beside the code and user-facing behavior belongs in `README.md`.

## Surfaces and build

Vite builds two HTML entry points from the repository root:

| Surface               | Entry        | React root                        |
| --------------------- | ------------ | --------------------------------- |
| Full bookmark manager | `index.html` | `src/main.jsx` → `BookmarkApp`    |
| Toolbar quick add     | `popup.html` | `src/popup/main.jsx` → `QuickAdd` |

`scripts/build-chrome.js` runs after the Vite build and copies only extension
metadata, the background worker, icons, and legal notices into `dist/`. It must
not overwrite `dist/popup.html`, because that file contains Vite's generated
asset references. There is no content script and Bookmarkit injects nothing
into visited pages.

The default local store depends on Chrome extension APIs. The standalone web
build is therefore a Firebase deployment target rather than a localStorage-only
edition.

## Application and state flow

`src/components/BookmarkApp.jsx` orchestrates the full app: it decides what is
shown and which dialog is open, and wires the pieces together. It does not
implement them. Each concern with its own rules lives in a hook that can be read
and tested without a UI:

| Hook                      | Owns                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `useBookmarkStore`        | The active store, the bookmark list, every write path, and the inverse each write records.                        |
| `useLLMSettings`          | Which provider is in use, its options, and the passphrase lock protecting the API key at rest.                    |
| `useAgentEngine`          | One agent request: rate limiting, cancellation, discarding superseded replies, parsing, and error classification. |
| `useBookmarkSelection`    | Which bookmarks are selected, and the pointer and key gestures that change that.                                  |
| `useKeyboardShortcuts`    | App-level shortcuts, suspended while a dialog is open.                                                            |
| `useSmartViews`           | Saved views: reading them from storage, and writing the list back.                                                |
| `useUndoHistory`          | The undo stack and the toast offering its newest entry.                                                           |
| `useTheme`, `useDebounce` | Theme selection; debounced values.                                                                                |

The dividing line is worth stating, because it is what keeps the orchestration
from creeping back: a hook owns a rule, the component owns the consequences.
`useAgentEngine` produces a plan and hands the steps back; opening a dialog or
persisting an order in response is the component's business. `useBookmarkSelection`
decides what is selected; deleting the selection is not its concern. The agent
plan itself is component state, since the view, the manual filters, and a
persisted reorder all read it.

`src/popup/QuickAdd.jsx` is a separate small surface, but it uses the same store
hook and theme hook so bookmark writes do not fork. It passes no undo recorder,
which is how a surface opts out of undo: there is nowhere in a popup that closes
on save to offer it.

The visible list is a projection, never a second source of truth:

```text
store bookmarks
  → applyAgentPlan(lastAction)
  → applyManualFilters(effectiveFilters)
  → displayedBookmarks
```

Manual sorting runs last and intentionally overrides an agent sort. Clearing
manual filters does not clear the agent plan, and clearing agent search does
not clear manual filters.

A saved view (#49) is a name over both inputs to that projection, which is why it
is persistence rather than a feature: `utils/smartViews.js` holds what a view is,
`useSmartViews` holds where it lives, and applying one just sets the plan and the
filters. Views are read back as untrusted input — a stored plan is re-serialized
through `parseAgentResponse` so it faces the same action whitelist a model's
answer does, and an unknown action cannot reach `applyAgentPlan` by way of
storage. Which view is active is derived by comparing the screen to the saved
ones, so editing a filter afterwards visibly leaves it.

Anything persisted goes through `utils/extensionStorage.js`, which knows the one
thing callers should not have to: `chrome.storage.local` in the extension,
`localStorage` in the web build, and never `chrome.storage.sync`.

Keyboard behavior has one owner at a time. The `Modal` wrapper in
`DesignSystem.jsx` gives every dialog the same contract — focus moves in on
open, Tab is trapped, Escape closes through the same guard as a scrim click, and
focus returns to whatever opened it — so no dialog implements this for itself.
Escape is handled on the dialog's own panel and stops there, which is what keeps
the app's shortcuts from firing behind an open dialog and stops a nested dialog
from closing its parent. App-level shortcuts are declared through
`useKeyboardShortcuts`, which skips typing contexts and is suspended entirely
while any dialog is open.

## Undo

Undo is a property of the write path, not of the two call sites that remember to
snapshot. `useBookmarkStore` derives the inverse of each successful write from
the write itself — `src/utils/bookmarkUndo.js` maps an operation to a label and
an `apply` — and hands it to `useUndoHistory`. Three consequences worth keeping:

- An inverse is expressed in terms of the ordinary write helpers, so restoring
  goes through the same paths as the original, sequential fallbacks and import
  progress included, rather than a second and less careful copy.
- A write with no honest inverse records nothing rather than offering an undo
  that fails when reached for.
- A batch is one entry. A bulk edit over forty bookmarks is one undo, and it
  restores only the fields the edit touched.
- The history outlives the toast. The toast is an offer with a timer; the stack
  is what `Cmd+Z` walks back through, and writes an undo makes are not recorded,
  so undo never turns into redo. A destructive write's offer does not expire.

## Persistence boundary

`src/stores/index.js` selects one of three implementations behind the shared
bookmark-store contract:

| Store                     | Responsibility                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localCompositeStore.js`  | Default extension store: Chrome bookmarks own title and URL; `localStorage` entries prefixed `bm_meta:` own tags, rating, description, and other metadata. |
| `chromeBookmarksStore.js` | Direct Chrome Bookmarks API adapter without metadata persistence.                                                                                          |
| `firebaseStore.js`        | Optional Firestore store under `artifacts/<appId>/users/<uid>/bookmarks`.                                                                                  |

Every implementation supports initialization, listing/subscription, single and
bulk writes, deletion, order persistence, and `teardown()` — which must release
every backend listener `init()` registered, because a store instance is created
per mount rather than shared. New UI paths should depend on that behavior
through `useBookmarkStore`, not detect or call a backend directly.

A store write notifies subscribers once, when the whole write is done. Chrome
reports bookmark changes one event per touched node, and reading the list means
walking the tree, so treating each event as a change made an N-item write cost N
walks. `chromeBookmarksStore` ignores the events its own writes echo back and
coalesces bursts it did not cause. Anything added to a store must keep that
property: one write, one notification, whatever its size.

A few contract methods are optional, `updateMany` among them: a store implements
it when it can write a whole selection in one round-trip, as Firestore can with a
batch, and callers fall back to writing one bookmark at a time. The fallback is
part of the contract rather than a workaround, so a new store is useful before it
is complete.

## LLM boundary

Provider adapters in `src/llm/providers/` expose `generate(prompt)` through the
factory in `src/llm/index.js`. The app asks a provider for structured action
steps, parses them, and applies the resulting plan to the in-memory bookmark
list. Provider failure falls back to ordinary bookmark search; persistence is
still performed only by a store operation initiated by application behavior.

Runtime provider settings override build-time defaults and remain in browser
storage. They are user configuration, not repository configuration, and must
never be committed.

## Trust and privacy boundaries

- Local-mode bookmark content stays in Chrome bookmarks plus the extension's
  local metadata. Firebase mode stores it in the configured Firebase project.
- LLM prompts leave the browser only for the provider the user selected. API
  keys are stored in browser local storage and are never build inputs in the
  default release.
- URL reachability checks execute in `public/background.js`, not page context.
  They accept only public HTTP(S) destinations and do not follow redirects, so
  the extension's broad host permission does not become an internal-network
  request primitive.
- The release archive includes `LICENSE` and generated
  `THIRD-PARTY-NOTICES.md`. The latter is derived from the locked production
  dependency closure and checked for drift in CI.

## Release model

Changesets describe user-visible changes. The version-cut workflow maintains a
reviewable version PR, synchronizes the npm and extension-manifest versions,
and creates the immutable tag after that PR merges. The release workflow
revalidates the tagged tree, builds the Chrome extension, and publishes the zip
and checksum. Manual version edits, tags, or uploads bypass those consistency
checks and are unsupported.
