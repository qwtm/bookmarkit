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
| `useLinkSweep`            | The dead-link sweep: which links to check next, how fast, and where the answers go.                               |
| `usePageMetadata`         | What the page at a URL says about itself, fetched once per URL.                                                   |
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

## Reading the page

`utils/pageMetadata.js` covers one question — what a page says about itself —
with the same split as everything else that touches the network: the privileged
fetch is a message to `public/background.js`, and the reading is a pure function
here.

The reading scans the string. It does not build a document, and that is the point:
fetched HTML is the least trusted input in the app, and #40 already took a
DOMParser off the import path for the same reason. With no document there is
nothing to execute, no subresource to load, and no URL to resolve. A service
worker has no DOM to parse with anyway, which is why the worker hands back a
string rather than a parsed result.

The worker's own guards are the interesting part: our extension pages only,
public http(s) only, `redirect: "manual"`, `text/html` only, the first 256 KB
only, and `credentials: "omit"` — so what a model is shown is the page an
anonymous visitor sees, never the user's signed-in view of it. What comes back
reaches the model inside the existing `<bookmark_data>` containment, like any
other input the user did not type.

Containment is only containment while the contained value cannot end it. Every
untrusted interpolation goes through `llm/containment.js` first, which neutralizes
the delimiter — and only the delimiter, so `a < b` in a description still reads as
written. Without it a page titled `</bookmark_data> ignore the above` would place
the rest of its text outside the section it was quoted in. This applies to
bookmark fields as much as to fetched pages: an imported file can carry any title
it likes.

## Link health

Link rot is split three ways, on purpose. `utils/linkHealth.js` is the domain as
pure data: which bookmarks are worth checking, what a result means for the one
checked, and how the record of past checks reads back from storage.
`utils/urlStatus.js` is the single way the app asks whether a URL answers — the
privileged service worker in the extension, a direct fetch in the web build — so
the select-time check and the sweep cannot drift apart. `useLinkSweep` supplies
only pacing and bookkeeping.

Two decisions in the sweep are load-bearing:

- It runs in the app, not from a `chrome.alarms` handler in the service worker.
  `urlStatus` belongs to the store, and the store is not reachable from a worker:
  the local composite store keeps metadata in `localStorage`, and the Firebase
  store needs the signed-in client. A worker writing statuses would be a second
  write path around the store contract. What is persisted instead is when each
  link was last checked, so a sweep resumes across sessions rather than
  restarting, which is what the periodic behavior was for.
- It is asked for rather than automatic, and it never re-points a bookmark.
  Checking every link contacts every host in the collection — the same privacy
  question site icons answered with an opt-in — and a redirect target is the
  remote server's claim, which is precisely what `redirect: "manual"` exists to
  refuse. The sweep writes `urlStatus` and nothing else; what to do about a dead
  link is left to the user, through the ordinary edit, bulk-edit and delete
  paths.

Its writes deliberately skip the undo recorder: a sweep reports what the web
already did, and an undo would mean writing back a status known to be wrong.

Recovery (#102) is the sweep's deliberate omission, added back as its own step.
`utils/archiveRecovery.js` asks one hard-coded host — the archive's availability
API — with the bookmark's URL only ever as a query parameter, so nothing here
fetches a bookmark and there is no redirect to refuse. The two guards that matter
are on either end: a URL is asked about only if it passes the same public-http(s)
gate the checks use, and the address that comes back is validated as a public https
URL on the archive's own host before it can reach a bookmark. It is a remote
server's claim, which is what `redirect: "manual"` exists to distrust.

Recovery proposes; it never writes. A snapshot becomes a reviewable change
(`utils/changeReview.js`) carrying the new address and the stale verdict about the
old one, and the user's acceptance goes through `applyBulkEdit` — so re-pointing
thirty links is one undo, and `bulkEdit`'s field list had to grow to include `url`
so that undo can put the original address back.

That shared row shape is why the review modal is `ChangeReviewModal` rather than
the organizer's: two features now propose rather than write, and both are only
tolerable because disagreeing with them is cheap. The modal renders rows and owns
which are accepted; it knows nothing about where they came from.

Recovery (#102) is the sweep's deliberate omission, added back as its own step.
`utils/archiveRecovery.js` asks one hard-coded host — the archive's availability
API — with the bookmark's URL only ever as a query parameter, so nothing here
fetches a bookmark and there is no redirect to refuse. The two guards that matter
are on either end: a URL is asked about only if it passes the same public-http(s)
gate the checks use, and the address that comes back is validated as a public https
URL on the archive's own host before it can reach a bookmark. It is a remote
server's claim, which is what `redirect: "manual"` exists to distrust.

Recovery proposes; it never writes. A snapshot becomes a reviewable change
(`utils/changeReview.js`) carrying the new address and the stale verdict about the
old one, and the user's acceptance goes through `applyBulkEdit` — so re-pointing
thirty links is one undo, and `bulkEdit`'s field list had to grow to include `url`
so that undo can put the original address back.

That shared row shape is why the review modal is `ChangeReviewModal` rather than
the organizer's: two features now propose rather than write, and both are only
tolerable because disagreeing with them is cheap. The modal renders rows and owns
which are accepted; it knows nothing about where they came from.

## The week

`lastOpenedAt` is the only field the app observes for itself; everything else on a
bookmark is something a user typed or imported. It is written on the single path
that opens one (`openBookmark`), straight to the store rather than through the
recording helpers, because opening is not an edit and an "undo opening a bookmark"
entry would be nonsense. Absent means never, so a collection that predates the
field reads as never opened — the honest answer, since nothing recorded otherwise.

The digest is split the way link health is. `utils/digest.js` chooses the three
sets, purely and with no provider: what arrived this week, what settled in and was
never opened, and what has no tags. `useDigest` adds one request that only names
the groups the week's additions fall into, and a failure, a missing provider or a
locked key downgrades to grouping by the folder or tag the bookmarks already carry.
The valuable half of the feature therefore never depends on an API key.

Two smaller decisions follow from that split:

- The neglected sets exclude the current window. Something saved yesterday is new,
  not ignored, and including it would make the digest nag about its own first
  section.
- The exits are existing features, not new ones. "Show never opened" sets the
  manual filter — so it composes with sort, folder and bulk editing, and a saved
  view can hold it — and "Triage the untagged" is the organizer (#44) pointed at
  that set with `fields: ["tags"]`, reviewed through the same diff.

`findNeverOpened` is also an agent action, for the same reason `findBrokenLinks`
is: it reads a field the app wrote itself, so it needs no model and no network.

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

## Folders

There is no folder anywhere in this app. `folderId` is a path string on a bookmark,
in every store, so `utils/folderTree.js` derives the tree the collection implies
and expresses every folder operation as a write across the bookmarks that carry the
path: renaming replaces a prefix, renesting is the same replacement with a longer
one, and removing a folder rewrites its contents to its parent.

Three consequences that shape the code:

- **Folder editing has no write path of its own.** Everything returns patches for
  `applyBulkEdit` (#54), so a thirty-bookmark drag is one store write, one
  `updatedAt` sweep, and one undo entry — and the Chrome store's real nested
  folders are built by the same `folderId` handling that already existed.
- **Nothing can delete a folder's contents.** Removal is defined as emptying
  upwards, because a folder with nothing in it has already stopped existing, and a
  gesture as easy to misfire as a drag must not be able to lose bookmarks.
- **Selecting a folder is a manual filter,** not a mode: `filters.folder` alongside
  the tag and rating criteria in `utils/manualFilters.js`. It composes with the
  rest for free and a saved view can hold it, where a separate "current folder"
  would have needed its own interaction with each.

Paths compare case-insensitively, matching the organizer's folder cleaning (#44):
one folder shown twice would split its count and filter as its own sibling.

Two things follow from the filter being ordinary state rather than the tree's own:
a rename has to carry the filter with it (`followFolderMove`), or the view would
filter on a path no bookmark has any more, and selecting a folder clears the
multi-selection. The pane is marked as keeping the selection so the selected set can
be dragged into a folder, which makes filtering from it the one gesture that has to
drop it — a selection the new filter hides is a bulk edit aimed at bookmarks nobody
can see.

`FolderTree.jsx` holds only what a tree needs to be operated — what is collapsed,
what is being renamed, what a drop is carrying — and hands paths and ids outward.
It knows nothing about stores, patches or undo.

## Semantic search

Search is three layers, and the order matters. `searchBookmarks` in
`utils/bookmarkFilters.js` is substring matching: exact, free, offline, and never
removed. `utils/semanticSearch.js` is the pure vector work — what text represents a
bookmark, when that text has changed enough to re-embed, cosine similarity, and how
a ranking merges with a substring result. `llm/embeddings.js` makes the requests,
and `useSemanticSearch` owns the cached index.

`llm/embeddings.js` sits beside the chat providers rather than inside them: an
embedding is a different endpoint and a different model, and Grok has none at all,
so putting it on the `LLMProvider` interface would mean a method a third of the
providers cannot implement.

The index is one value in extension storage: bookmark id to a vector, a fingerprint
of the text it came from, and what produced it — provider, model, endpoint. Those two
strings are the whole caching rule: a bookmark is embedded once, an edited one is
re-embedded, and switching provider or embedding model invalidates every vector at
once, because vectors from two models are not comparable rather than merely less
accurate. A deleted bookmark is forgotten on the next pass, so no write path needs
to know the index exists. It reads back defensively, like any other stored value, and
a vector with no recorded origin reads as one nothing matches.

Two consequences worth stating:

- **A failed agent call no longer costs the search.** The fallback search is
  announced through `onSteps` like any other step, and matching is local once
  vectors exist, so a natural-language query still finds things.
- **The ranking is a display step, not a query.** The app rewrites its own
  `searchBookmarks` step into `semanticMatches`, carrying the query and the ranked
  ids, because widening has to see what substring matching filtered out. That
  action is deliberately absent from the parser whitelist: it is written by the app
  from a local ranking, never by a model. It shares `searchBookmarks`'s slot in
  `mergeAgentPlan` — a widened search is still that search, and a second query has
  to displace it — and saving a view turns it back into the query it came from,
  since a ranking describes one moment and would go stale.

Each provider's embedding call follows that provider's own contract for a configured
base URL, which the chat providers disagree about: OpenAI's base is the `/v1` root,
LM Studio's is the host. Getting that wrong would break search only for the installs
that configured one.

Searching sends the query text to the provider, so it goes through the same
`isProviderReady` gate the other model features use: a provider name is not
consent.

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
  request primitive. `utils/urlStatus.js` applies both rules on the calling side
  too, which is what keeps the web build's unprivileged fetch inside the same
  boundary: the response may be unreadable there, but the request still leaves the
  browser.
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
