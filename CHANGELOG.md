# bookmarkit

## 0.2.1

### Patch Changes

- f7858f1: The extension toolbar and chrome://extensions listing now show the bookmarkit
  emblem instead of the placeholder icons. The same assets are registered at the
  manifest top level so packaging and the extensions page pick them up.

## 0.2.0

### Minor Changes

- 776b91e: Recover a dead link from an archived copy.

  Once a sweep has found dead links, **Find Archived Copies** asks the Internet
  Archive whether it kept a copy of each one and shows what it found as a diff. It
  proposes: nothing is re-pointed until you accept it, and accepting is one undo
  however many links changed.

  It asks about the dead links you have selected, or the ones on screen when nothing
  is selected — so a folder, a search or a selection is how you scope it. Only public
  http(s) addresses are asked about, the request goes to one hard-coded host with the
  bookmark's URL as a parameter, and the snapshot address that comes back is
  validated as a public https address on the archive's own host before it can reach a
  bookmark. Recovered bookmarks are marked for re-checking rather than assumed good.

- 5a84f35: Multi-selection can now do more than delete. Selecting several bookmarks brings
  up a bar that adds or removes tags, moves them into a folder, and sets or clears
  ratings across the whole selection.

  Tags are added and removed rather than replaced, so bulk-tagging forty bookmarks
  does not discard forty sets of existing tags. Bookmarks the change would not
  alter are left untouched instead of being rewritten with a new modified date, and
  the bar says how many those are before you apply. A large selection asks for
  confirmation once, and the whole batch is a single undo.

- 70aa3f7: Find the bookmarks that no longer resolve. "Check Links" sweeps the collection a
  few links at a time, marking whatever it cannot reach, and remembers what it
  checked so stopping or closing the app resumes rather than restarts. The results
  are a filter: "Broken only" in the filter bar, or asking the agent for your
  broken links. Only public http(s) addresses are checked, bookmarks marked "Ignore
  checking" are skipped, and no bookmark is ever re-pointed at a redirect on its
  own.
- 5ce9d06: Reach Bookmarkit without opening it. Type `bm` and a query in the address bar to search what you have
  saved and jump straight to it — matched locally, so there is no wait. Right-click a page to bookmark
  it, or right-click a link to bookmark the link rather than the page it sits on, which was not possible
  from the popup at all. And `Alt+Shift+B` opens quick add for the current page; rebind it at
  `chrome://extensions/shortcuts`.
- d730dc9: Stop sending your bookmark domains to Google by default. Every bookmark without its own icon used
  to request one from google.com on render, so opening the list reported the collection to a third
  party. Icons now come from the bookmark, then the browser's own favicon cache, then a local
  placeholder; the remote service is opt-in under Options → Privacy.
- 9a1aac3: Folders are somewhere to stand rather than a text field. A "Folders" pane shows the
  tree your `folderId` paths already imply, with per-folder counts; clicking a folder
  filters to it and its subfolders, combines with the other filters, and can be saved
  as a view.

  Rearranging is direct: drag bookmarks onto a folder to move them (a dragged card
  takes the whole selection with it), drag a folder onto another to renest it, rename
  one in place, or remove one — which moves its contents up to the parent and never
  deletes a bookmark. Each gesture is a single bulk write, so it is also a single
  undo. The form's folder field now completes against the folders you have, so a typo
  is a typo instead of a new folder.

- 08e1166: "Clean up my bookmarks" asks your LLM for tags, folders, and missing descriptions
  across the bookmarks in view, and shows the result as a diff: one row per
  bookmark, every row ticked, unticking anything you disagree with. Nothing is
  written until you apply, and applying counts as a single change, so one
  Cmd/Ctrl+Z puts the whole tidy-up back.

  Titles and URLs are never proposed, existing tags and descriptions are added to
  rather than replaced, and a suggested folder is matched against the folders
  already in use instead of becoming a second one beside them. Large collections are
  asked about in slices with progress and a Stop button.

- 4425a6a: Suggestions now read the page instead of guessing from its URL. In the extension,
  the background worker fetches the page — public http(s) only, no redirects
  followed, HTML only, capped, and with cookies omitted — and its own title,
  description and opening text go to the model inside the usual untrusted-data
  containment. An empty title is filled in from the page; one you wrote is left
  alone. The web build keeps working from the URL as before.
- 8f5c9a8: Searches and filters can now be saved. Once the list is narrowed down, "Save
  current view" names what is on screen — the agent's plan, the manual filters, or
  both — and it comes back as a chip above the list. The chip for the view you are
  currently looking at is highlighted, and stops being highlighted as soon as you
  change something.

  Saved views are read back as untrusted data: a stored plan goes through the same
  action whitelist an AI response does, so a view that was hand-edited or written by
  a newer version cannot introduce an action this version does not know.

- 4793ade: "Remove Duplicates" can now spot the same article saved under two different URLs.
  After the rule-based pass, a configured LLM is asked about the pairs no rule can
  settle — a canonical link and a syndicated copy, a paginated page and its print
  view — and its proposals appear in the usual confirmation dialog with the reason
  for each pair shown. With no provider configured, or a key still locked, nothing
  changes: the deterministic pass is the default and remains the whole of it.
- 4d8ae8e: Search now understands meaning as well as spelling. With a provider that offers
  embeddings (Gemini, OpenAI, Ollama, LM Studio), "that article about vector
  databases" finds the bookmark titled "Pinecone basics". Exact matches stay at the
  top and nothing is taken away, so a search never gets worse.

  Each bookmark is embedded once and cached locally under a fingerprint of its text,
  so only edited bookmarks are re-embedded and matching stays local. That also mends
  the old fallback cliff: when the agent request fails, the natural-language query
  still finds things instead of degrading into a substring search for the whole
  sentence.

- ebc7309: Detect duplicates by the page a bookmark points at instead of its exact title and URL, so `http`
  versus `https`, `www.`, trailing slashes, tracking parameters, and a renamed copy all match. When
  copies differ, the one carrying tags, a rating, or a description is kept — including when both
  copies arrive in the same import.
- 592a75e: Undo now covers every change, not just deleting and sorting. Edits, adds,
  imports, de-duplication, and "replace all" can all be taken back, and Cmd/Ctrl+Z
  walks back through the last ten changes even after their toasts have gone.

  Undo is derived from the write itself rather than snapshotted at the call site,
  so a restored delete or overwrite brings back tags, ratings, folders, and notes
  along with the bookmarks. Destructive changes keep their offer until it is used
  or dismissed instead of expiring on a timer.

- 0432fc9: Report the week: a digest of what you saved, what you never opened, and what you
  left untagged.

  Opening a bookmark now records when, which is the only thing Bookmarkit observes
  about a bookmark rather than being told. That makes two new ways to find what a
  large collection has buried: a **Never opened** filter and a **Last opened** sort,
  both of which the agent can ask for and a saved view can hold.

  **Digest** in the header collects the three lists and offers the obvious next
  moves — filter to what you never opened, or hand the untagged ones to the
  organizer for tag suggestions. Naming the themes among the week's additions is the
  only part a provider does; without one, additions are grouped by the folder or tag
  they already carry.

### Patch Changes

- 0a470d6: Stop the UI from freezing when importing or reordering a large collection. Chrome reports one event
  per bookmark it touches, and each one rebuilt the whole list, so importing N bookmarks did N full
  rescans. A write now refreshes the list once, however many bookmarks it covers.
- 38889f2: Keep imported folders in the real bookmark tree, and stop a failed replace from taking your
  collection with it. Bulk imports put every bookmark flat under the `bookmarkit` root, so folders
  showed up in Bookmarkit but `chrome://bookmarks` and every synced device saw one pile. Replacing all
  bookmarks also deleted the old ones before writing the new ones; now the replacements are written
  first and a failure part way through leaves the collection untouched — including the folders, so a
  replace no longer leaves empty shells of the folders it replaced, and a failed one leaves no new
  folders behind.
- b73b3c1: Internal restructuring of the full app with no change in behaviour: the LLM provider settings and
  their passphrase lock, the agent request lifecycle, bookmark selection, and the undo offer each moved
  out of the one large component into their own hook. They are now covered by tests, which the rules
  inside them — the API key never reaching synced storage, a failed encryption write keeping the key, a
  superseded agent reply being discarded — previously were not.
- b15b924: Every dialog now closes with Escape and keeps focus inside it. Only three of them did: the bookmark
  form, Options, and Import/Export had no keyboard way out at all, and Tab could wander off into the
  page behind them. The three that worked each listened on the document, so Escape also reached the
  list behind the dialog — clearing your selection as it closed — and the Theme File Format dialog took
  Options with it when dismissed. Escape now belongs to whichever dialog holds focus, and focus returns
  to whatever opened it. App shortcuts no longer fire behind an open dialog, and `h` no longer toggles
  the header while you are reading one.
- 3a2ed46: Harden LLM response and error handling: a programming bug no longer reports itself as "could not
  reach the LLM provider", plans wrapped in prose or in a second code fence are read instead of
  silently coming back empty, a rate-limited provider asking for an hour surfaces the limit instead of
  stalling the request, and following a URL redirect can no longer bounce between two URLs.
- 860b891: Stop Firebase mode from looking like your bookmarks disappeared. A dropped or refused connection
  replaced the list with an empty one, so every bookmark vanished from the screen and a save from that
  view would have been made against nothing. The last loaded list now stays put and the problem is
  reported instead. A refused sign-in also used to leave the app loading forever; it now says what
  went wrong, and a collection that could not be opened says so rather than showing an empty list you
  could add to.
- 0a210a0: Keep folder structure, tags, and rating through an HTML export and re-import. HTML export wrote one
  flat list, so backing up to HTML and restoring it collapsed every bookmark into a single folder.
- d32d169: Let you retry a failed import, and stop a hand-edited file from writing junk into your collection.
  Picking the same file twice in a row did nothing, because the browser only reports a change when the
  selection changes, so a rejected file could not be corrected and re-picked. A JSON import is now also
  checked before you confirm it: the count you approve is the number of bookmarks that will actually be
  added, entries without an openable http(s) address are named as skipped instead of silently dropped,
  and fields like a rating of "4" or tags written as one comma-separated string are normalised at the
  boundary rather than breaking the list later.
- cea435a: Saving a sort order now reaches bookmarks inside folders. Only root-level bookmarks were actually
  moved, so a foldered collection kept its old order with no notice, even though the view showed it
  sorted. The order is applied within each folder, and folders stay where you put them.
- 8fb0d46: Make the star rating behave like a real radio group: one tab stop instead of five, arrow keys to
  change the rating, and ArrowLeft off the first star to clear it back to unrated.
- e2d6250: Release bookmark-store listeners on teardown, so remounting no longer accumulates Chrome bookmark
  event listeners or Firestore snapshot subscriptions that keep firing into a discarded store.
- 20b0c6e: Stop a bookmark refresh from running after the page that asked for it has gone. Changes made
  elsewhere are gathered up for a moment before the list is reread, and closing the popup in that
  moment left the reread scheduled against a browser API that was no longer there.
- 1ecabc8: Fail fast when an LLM request hits its timeout. A hung provider now surfaces after the 30s deadline
  instead of silently retrying twice more and leaving the search spinner live for over a minute.

## 0.1.1

### Patch Changes

- 24b2adb: Restyle the web app and Chrome popup with the Bookmarkit Design System.

## 0.1.0

### Minor Changes

- 9d67f77: Add a deterministic filter bar (tag chips, rating, sort, instant text filter) that works with no
  LLM configured, and a toolbar quick-add popup that bookmarks the current tab and edits an
  already-saved URL instead of duplicating it.

### Patch Changes

- f0fbb5e: Ship the MIT license and generated third-party notices in extension release archives.
- 9d67f77: Publish the packaged extension to GitHub Releases so installing no longer requires cloning and
  building. Every CI run also attaches the same zip as a downloadable artifact.
