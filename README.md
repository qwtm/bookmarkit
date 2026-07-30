# bookmarkit

**Bookmarkit** is a modern, React‑powered application that helps you organize and query your bookmarks using natural language. It can be used both as a **Vite/React web app** and packaged as a **Chrome extension**.

Key capabilities include:

- Natural-language search and AI-driven actions
- Multi-provider LLM integration (Gemini, OpenAI, Grok, Ollama, LM Studio)
- Import/export to JSON or Netscape HTML
- Local or optional Firebase storage backend

The project is built with Vite, styled with Tailwind CSS, and designed for flexibility through runtime configuration and modular architecture.

---

## Features

- Saved views
  - Name what is on screen — an agent plan, manual filters, or both — and return
    to it from a chip
- Semantic search
  - Finds “that article about vector databases” even when none of those words are
    in the bookmark, and keeps the exact matches at the top
- Natural language search (AI agent)
  - Examples: “find github”, “find tags: react then sort by rating descending”, “show 3 stars or more”, “remove duplicates”, “clean up my bookmarks”
  - Persist sorted order across all bookmarks (e.g., “reorder descending by title”). A saved order
    is applied within each folder, since a bookmark’s position only exists among its siblings.
- Import/Export
  - JSON array of bookmarks
  - Netscape Bookmark HTML (compatible with browsers’ export files)
- Bookmark management
  - Add, edit, delete, tag, folder, rating, favicon support
  - Multi‑select (Cmd/Ctrl+Click), open in new tab (Shift+Click)
  - Detect and remove duplicates by the page they point at, with an optional
    second opinion from your LLM on the same article saved under two URLs
  - Bulk edit a multi-selection: add or remove tags, move to a folder, set or
    clear ratings
  - Undo the last ten changes with Cmd/Ctrl+Z — edits, adds, deletes, imports,
    de‑duplication, sorts, and “replace all”
- URL status
  - Lightweight validity check via HEAD request from the extension service worker
  - One‑click “Ignore checking” toggle per bookmark
  - Sweep the whole collection for dead links, resumable, and filter to what it
    found
- Suggestions that read the page, not just its URL
  - The extension fetches the page in its service worker and feeds its own title,
    description, and opening text to the model
- LLM integration (runtime‑configurable)
  - Gemini, OpenAI (ChatGPT), Grok (x.ai), Ollama (local), LM Studio (local)
  - Model discovery (where supported), custom base URLs, stored per provider
- Storage backends
  - Local (browser) by default
  - Optional Firebase (Cloud Firestore) backend
- Keyboard shortcuts
  - Click selects; Cmd/Ctrl+Click multi‑selects; Shift+Click opens
  - Double‑click or E to edit
  - Esc clears selection
  - Cmd/Ctrl+A select all, Cmd/Ctrl+D delete selected
  - D deletes (with confirmation), Space opens selected

## Demo (quick tour)

- Top search bar: type natural language queries and hit Enter.
- Options: type “options” in the search bar to open provider settings.
- Import/Export: button in the header for JSON/HTML.
- Remove Duplicates: button in the header or type “remove duplicates”.

## Getting started

### Prerequisites

- Node.js — version pinned in `.nvmrc` (`nvm use`)
- npm
- Google Chrome (for the extension)
- Optional:
  - API keys for LLMs (Gemini/OpenAI/Grok), or
  - Local LLM runtime (Ollama or LM Studio)

### Install a release (recommended — no build required)

1. Download `bookmarkit-v<version>.zip` from the **[latest release](https://github.com/qwts/bookmarkit/releases/latest)**.
2. Optionally verify it against the published checksum:
   ```bash
   shasum -a 256 -c bookmarkit-v<version>.zip.sha256
   ```
3. Unzip it.
4. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the
   unzipped folder.
5. Pin the toolbar icon. Clicking it opens quick-add for the current tab; "Open full app" in the
   popup opens the full bookmark manager.

Want a build of an unreleased branch? Every CI run attaches the same zip as a `bookmarkit-extension`
artifact — open the run from the
[Actions tab](https://github.com/qwts/bookmarkit/actions/workflows/ci.yml) and download it from the
run summary.

### Build from source

Node is pinned in `.nvmrc` (`nvm use` picks it up).

```bash
git clone https://github.com/qwts/bookmarkit.git
cd bookmarkit
npm install
npm run build:chrome   # -> dist/, load that folder as unpacked
```

> **`npm run dev` is not a dev server.** It runs `vite build --mode development` — a sourcemapped,
> unminified build into `dist/`. There is no HMR: re-run it after each change and reload the
> extension from `chrome://extensions`. `npm run preview` serves `dist/` over HTTP, but the default
> storage backend needs the `chrome.bookmarks` API, so the app only really works when loaded as an
> extension (or built with `__use_firebase__`).

## Chrome extension

Load either the released zip or your own `dist/` build (see **Install** above) via
`chrome://extensions` -> Developer mode -> Load unpacked.

The extension ships two surfaces from one build:

| Surface       | Entry        | What it is                                                                                                                                  |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar popup | `popup.html` | Quick-add for the current tab: prefilled title/URL, tags, rating, folder. Detects an already-saved URL and edits it instead of duplicating. |
| Full app      | `index.html` | The complete manager (search, agent, import/export, options). Opened from the popup's "Open full app".                                      |

### Getting there without opening it

- **Address bar.** Type `bm` then a space, then anything: every word has to appear in a saved
  bookmark's title or address, so typing more narrows the list. Enter opens the highlighted match, or
  the best match if you never picked one. Matching happens locally against what you have saved — no
  network call and no model, because an address bar that waits feels broken. Tags and ratings live in
  Bookmarkit's own metadata rather than Chrome's tree, so they are not searched here; use the full
  app's search for those.
- **Right-click.** "Bookmark with bookmarkit" on a page saves the page. On a link it saves the
  **link**, with the link text as the title — quick-add opens in its own small window because a link
  is not the tab you are on.
- **Keyboard.** `Alt+Shift+B` opens quick-add for the current page. Chrome reserves `Ctrl+Shift+B` /
  `⌘+Shift+B` for its own bookmarks bar and silently drops an extension that asks for them, which is
  why the default is `Alt`. Rebind it at `chrome://extensions/shortcuts`.

Permissions requested (`public/manifest.json`):

- `bookmarks` — the default store keeps title/URL in the real Chrome bookmark tree.
- `storage` — settings, themes, and the per-bookmark metadata layer.
- `contextMenus` — the right-click entry point above.
- `<all_urls>` — lets the background service worker run URL reachability checks from a privileged
  context (bypassing page CORS), and lets the popup read the active tab's title/URL. Requests are
  restricted to public http(s) hosts; private, loopback, and link-local addresses are blocked, and
  redirects are not followed.

## Configure AI providers

You can configure everything at runtime in the Options dialog (type “options” in the search bar). Settings persist per browser in localStorage.

Supported providers:

- Gemini
- OpenAI (ChatGPT)
- Grok (x.ai)
- Ollama (local)
- LM Studio (local)

Options per provider:

- API key (remote providers)
- Base URL (OpenAI/Grok optional; Ollama/LM Studio required, e.g., http://localhost:11434 or http://localhost:1234)
- Model: auto‑discovery where supported, or type manually

Local providers:

- Ollama: install and run, pull a model (e.g., llama3.1), set base URL: http://localhost:11434
- LM Studio: run the local server, set base URL (default is often http://localhost:1234)

Tip: If an LLM call fails or returns invalid output, the app gracefully falls back to a general search.

## Optional: Build‑time defaults

You can set global defaults with Vite’s define. This is optional; the in‑app Options are usually enough.

vite.config.(js|ts) example:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// You can also read from process.env or .env files (VITE_* vars)
export default defineConfig({
  plugins: [react()],
  define: {
    __llm_provider__: JSON.stringify("gemini"),
    __llm_options__: JSON.stringify({
      // apiKey: process.env.VITE_GEMINI_API_KEY,
      // model: 'gemini-2.0-flash'
    }),
    __use_firebase__: JSON.stringify(false),
    __firebase_config: JSON.stringify(undefined),
    __app_id: JSON.stringify("bookmarkit"),
    __initial_auth_token: JSON.stringify(undefined),
  },
});
```

If you set **use_firebase** to true, also provide a valid __firebase_config (see Firebase section).

## Firebase (optional)

The app can use Firebase (Cloud Firestore) instead of local storage.

Steps:

1. Create a Firebase project and enable Firestore
2. Grab your web app config:
   - apiKey, authDomain, projectId, etc.
3. Provide it at build time:
   - Set **use_firebase**: true
   - Set __firebase_config: the JSON stringified Firebase config
4. Rebuild and run

Auth:

- The code exposes an optional __initial_auth_token if you want to inject an auth token at boot.
- If you don’t provide auth, your store module may default to anonymous or local. See your store implementation for details.

Data model:

- Bookmarks are stored with timestamps (createdAt/updatedAt)
- Reorder and live updates are supported via store methods

## Import/Export

- JSON
  - Exports an array of bookmark objects
  - Import expects the same: an array

Bookmark JSON shape (id is optional on import):

```json
[
  {
    "id": "optional",
    "title": "Example",
    "url": "https://example.com",
    "description": "Short description",
    "tags": ["reference", "web"],
    "rating": 4,
    "folderId": "work",
    "faviconUrl": "https://example.com/favicon.ico",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z",
    "urlStatus": "valid"
  }
]
```

- HTML (Netscape Bookmark File)
  - Compatible with exports from Chrome/Firefox/etc.
  - You can upload the file or paste its contents
  - Export creates a standard bookmark HTML with fields like ADD_DATE, LAST_MODIFIED, ICON, DESCRIPTION
  - Folders are written as nested `H3` sections and read back as slash-separated
    folder paths, so exporting and re-importing keeps your folder structure
  - Tags and rating travel in `TAGS` and `RATING` attributes. Other browsers
    ignore `RATING`; Firefox understands `TAGS`
- Imported folders are created in your real bookmark tree, so `chrome://bookmarks` and your synced
  devices see the same structure Bookmarkit shows
- Replacing all bookmarks writes the new set before removing the old one. If any bookmark cannot be
  written, nothing is replaced and your existing collection is left as it was.

## Natural language commands (examples)

- find github
- find tags: react then sort by rating descending
- filter rating >= 4 then sort by title asc
- show 3 stars or more
- remove duplicates
- clean up my bookmarks
- suggest folders for these
- show all
- reorder ascending by title
- limit first 10
- options (opens Options dialog)
- import or export (opens Import/Export)

The agent plans actions (search, filter, sort, limit, persist reorder) and updates the view accordingly.

Two bookmarks count as duplicates when they point at the same page, whatever
they are titled: `http` and `https`, `www.` and bare, a trailing slash, and
tracking parameters (`utm_*`, `fbclid`, `gclid`, `ref`, and similar) are all
ignored. Path, remaining query, and fragment still distinguish pages. When
copies differ, the one carrying tags, a rating, or a description is the one kept.

If an LLM provider is configured, “Remove Duplicates” then takes a second look at
the pairs no rule can settle — the same article under a canonical and a
syndicated URL, or a paginated page and its print view. Those proposals appear in
the same confirmation dialog with the reason for each pair spelled out, so nothing
is deleted before you have read why it was suggested. Without a usable provider —
no API key entered, or an encrypted key you have not unlocked this session — the
rule-based pass is all that runs and nothing leaves your machine, exactly as
before.

## Semantic search

Substring matching only finds words that are literally there. With an LLM provider
that offers embeddings — Gemini, OpenAI, Ollama, or LM Studio; Grok has no
embeddings endpoint — searching also compares meaning, so “storing vectors” can
surface a bookmark titled “Pinecone basics”.

Exact matches still come first, in their usual order; semantic hits are added
after them. Nothing is taken away, so a search never gets worse.

Each bookmark is embedded once and its vector is kept locally, filed under a
fingerprint of the text it came from — edit a bookmark and only that one is
re-embedded. After the first search, the only request a search makes is for the
query itself, which is also why semantic search keeps working when the agent call
fails: the index is already on your machine.

With no provider, no key, a provider without embeddings, or a locked key, search is
exactly the substring search it always was.

## Cleaning up with the agent

“Clean up my bookmarks” asks your LLM for tags, a folder, and — where a bookmark
has none — a description, for everything currently in view. Ask for less and it
does less: “suggest tags for these” proposes tags only.

Nothing is written until you say so. What comes back is a diff, one row per
bookmark, showing exactly which fields would change; every row starts ticked, and
unticking one drops it. Applying the rest counts as a single change, so one
Cmd/Ctrl+Z puts the whole tidy-up back.

What it will not do:

- Touch a title or a URL. Those say which page a bookmark is.
- Replace your tags. Suggestions are added to what is already there.
- Overwrite a description you wrote. It only fills in empty ones.
- Invent a folder next to one that already fits: a suggested `work/rust` becomes
  your existing `Work/Rust` rather than a second folder beside it.

Large collections are asked about in slices of 20, with progress shown and a Stop
button. A slice the model fumbles costs only its own suggestions.

## Keyboard shortcuts

- Click: select a bookmark
- Cmd/Ctrl+Click: toggle multi‑select
- Shift+Click: open in new tab
- Double‑click or E: edit selected
- Esc: clear selection
- Cmd/Ctrl+A: select all visible
- Cmd/Ctrl+D or D: delete selected (with confirmation)
- Space (on focused tile): select/open depending on context
- Cmd/Ctrl+Z: undo the last change

## Saved views

Anything you can narrow the list down to can be named and kept. Once a search or
a filter is active, **Save current view** appears above the list; saved views
become chips you can click to return to them, and the chip for the view you are
currently looking at is highlighted.

A view remembers both halves of the screen: the agent's plan and the manual
filters. It is stored under `bm_smart_views` in the extension's local storage
(`localStorage` in the web build), and it holds only the plan and the filters —
no bookmark data.

Views are read back as untrusted data. A stored plan goes through the same
whitelist an AI response does, so a view that was hand-edited, imported, or
written by a newer version cannot introduce an action this version does not know.
Anything unrecognised is dropped, and a view left with nothing to restore
disappears rather than becoming a chip that does nothing.

## Bulk editing

Select several bookmarks (Cmd/Ctrl+Click, or Cmd/Ctrl+A for everything shown) and
a bar appears above the list:

- **Add tags** and **remove tags** are additive, not a replacement. Adding
  `reading` to forty bookmarks keeps whatever else each of them was tagged with.
  Matching ignores case, so removing `react` also removes `React`.
- **Folder** moves the selection into an existing folder, a new path you type, or
  out of any folder.
- **Rating** sets or clears a rating across the selection.

The bar says what it is about to do and how many bookmarks it would leave alone
because they already match. Those are not written at all, so bulk-tagging does
not stamp a new modified date on bookmarks it did not change. Past ten
bookmarks, Apply asks once more before writing. The whole batch is one change,
so one Cmd/Ctrl+Z takes all of it back.

## Undo

Every change to your bookmarks can be taken back, up to the last ten. A toast
offers the newest one for a few seconds; Cmd/Ctrl+Z reaches back through the
rest, whether or not their toasts are still showing.

- Deletes and “replace all” (a JSON import that overwrites, for example) keep
  their toast until you use or dismiss it, since a timeout is no safety net for
  losing a whole collection.
- Undoing a delete or an overwrite restores the bookmarks with their tags,
  ratings, folders, and notes, not just their titles and URLs.
- Undo history lives in the page. Closing or reloading the app clears it, and it
  is not offered in the quick‑add popup, which closes as soon as it saves.

## Where suggestions get their facts

“Suggest” for a description or tags used to reason from the URL and whatever title
the browser supplied, which is close to nothing for an address like
`example.com/p/8812`. In the extension, the page is now asked directly.

- The fetch happens in the background service worker: public http(s) only, no
  redirects followed, HTML only, and at most the first 256 KB of it.
- Cookies are never sent. What the model sees is the page an anonymous visitor
  gets, not your logged‑in view of it.
- The HTML is read by scanning the text, never by building a document, so nothing
  in a fetched page can run, load, or resolve anything.
- The page's words go to the model inside the same containment as everything else
  you did not type — it is told not to follow instructions found in there.
- An empty title is filled in from the page. A title you wrote is never
  overwritten.
- In the web build there is no service worker, so suggestions work from the URL as
  before.

## Checking for dead links

Bookmarks rot. **Check Links** in the header sweeps the collection and marks
whatever it cannot reach, and the filter bar's **Broken only** toggle (or asking
the agent for your broken links) shows the results.

- The sweep is something you start, not something that happens quietly: checking
  every bookmark contacts every host you have saved.
- It goes a few links at a time with pauses between them, so a large collection
  does not look like a scanner, and it backs off when nothing can be reached —
  usually a sign your connection dropped rather than that the web did.
- It remembers what it checked. Stopping it, closing the app, or coming back next
  week resumes where it left off instead of starting over; a link checked in the
  last week is left alone.
- Only public http(s) addresses are checked, and a bookmark you marked “Ignore
  checking” is skipped entirely.
- A broken link is never re-pointed automatically. Redirect targets come from the
  remote server, and following one from a privileged fetch is exactly the hole
  the URL checks are guarded against, so what to do about a dead link is left to
  you: fix it in the form, or select the broken ones and delete them together.

## URL validation

- The extension checks URLs with a HEAD request issued from the background service worker, which
  runs in a privileged context and so bypasses page CORS. No third-party proxy is involved — the
  URL is sent only to the site itself.
- Only public http(s) hosts are checked. Private, loopback, link-local, and cloud-metadata
  addresses are refused, and redirects are not followed (both are SSRF guards).
- The web build has no service worker, so the check is an ordinary fetch — but the
  same two rules hold: public hosts only, and redirects are not followed.
- If a site is blocked or unreachable, status may show “invalid”.
- You can toggle “Ignore checking” per bookmark.

## Privacy and storage

- Local mode: data stays in your browser (local storage/IndexedDB per store implementation)
- Firebase mode: data is stored in your Firebase project
- API keys you enter in Options are saved to localStorage in your browser
- LLM calls are made from your browser to providers you select
- Site icons: no icon is fetched over the network unless you turn on “Load site icons from the web”
  under Options → Privacy. With it off, Bookmarkit uses your browser’s own favicon cache (extension
  only) or a neutral placeholder. With it on, each visible bookmark fetches the icon address saved
  with it, or asks google.com for one by domain — never by path or query. An icon address saved on a
  bookmark is treated the same as any other: an imported `ICON` attribute can point anywhere.

## Troubleshooting

- LLM errors/failures:
  - Ensure API key and base URL (if applicable) are set in Options
  - Try the “Refresh” button next to Model
  - Use a smaller model or local provider for testing
- Extension shows blank page:
  - Confirm manifest.json exists in dist
  - Load unpacked pointing to the dist folder after a build
  - Check Chrome console for CSP/network issues and adjust host_permissions
- URL check always invalid:
  - Some sites block HEAD requests; toggle “Ignore checking”

## Scripts

| Script                     | What it does                                                         |
| -------------------------- | -------------------------------------------------------------------- |
| `npm run dev`              | Sourcemapped, unminified build to `dist/`. **Not** a dev server.     |
| `npm run build`            | Production build to `dist/`.                                         |
| `npm run build:chrome`     | Production build + copies the extension files into `dist/`.          |
| `npm run preview`          | Serves `dist/` over HTTP (see the caveat under Build from source).   |
| `npm run lint`             | ESLint.                                                              |
| `npm test`                 | Vitest suite once (`npm run test:watch` to watch).                   |
| `npm run ci`               | The full gate CI runs: version policy, lint, tests, extension build. |
| `npm run changeset`        | Record a changeset describing a user-facing change.                  |
| `npm run licenses:notices` | Regenerate locked production dependency notices.                     |
| `npm run package:release`  | Build and package `release/bookmarkit-v<version>.zip` + checksum.    |

## Releasing

Releases are automated; nobody tags or uploads by hand.

1. A PR with a user-facing change adds a changeset (`npm run changeset`).
2. When it merges, **Version cut** opens or refreshes a rolling
   `chore: version bookmarkit` PR that applies the pending changesets and bumps
   `package.json`, `public/manifest.json`, and `package-lock.json` together.
3. Merging _that_ PR is the release action: it tags `v<version>` and triggers **Release**, which
   re-runs the full gate against the tag and publishes the zip + `.sha256` to a GitHub Release.

`npm run check:version-policy` enforces that the three version artifacts never drift apart — a
manifest that disagrees with `package.json` would ship a build that lies about its own version.

## Contributing

Issues and PRs are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md); the
repository architecture is documented in [DESIGN.md](DESIGN.md).

## License

Bookmarkit is available under the [MIT License](LICENSE). Bundled dependencies
retain their own terms; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
