// #51: Toolbar popup — bookmark the current tab without opening the full app.
// Goes through the same store factory and the same useBookmarkStore hook as the main
// app, so the popup and the app can never drift into two different write paths.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBookmarkStore } from "../hooks/useBookmarkStore.js";
import { useTheme } from "../hooks/useTheme.js";
import { isSafeHttpUrl } from "../utils/url.js";
import { Banner, Button, Input, StarRating, Tag } from "../components/DesignSystem.jsx";

function QuickAddFields({ form, setForm, folderOptions }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <>
      <div>
        <Input
          id="qa-title"
          type="text"
          value={form.title}
          onChange={set("title")}
          placeholder="Title"
          aria-label="Title"
          autoFocus
        />
      </div>

      <div>
        <Input
          id="qa-url"
          type="text"
          value={form.url}
          onChange={set("url")}
          placeholder="https://…"
          aria-label="URL"
          style={{ fontSize: "var(--text-xs)" }}
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            id="qa-tags"
            type="text"
            value={form.tags}
            onChange={set("tags")}
            placeholder="tags, comma, separated"
            aria-label="Tags, comma separated"
          />
        </div>
        <div className="flex-1">
          <Input
            id="qa-folder"
            type="text"
            value={form.folderId}
            onChange={set("folderId")}
            placeholder="Folder (e.g. Work/API)"
            aria-label="Folder"
            list="qa-folders"
          />
          {/* Cheap folder autocomplete against paths already in use — typing a folder
              path blind is how you end up with both "work" and "Work". */}
          <datalist id="qa-folders">
            {folderOptions.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>
    </>
  );
}

const shellStyle = { backgroundColor: "var(--bg-primary)" };

function PopupError({ message, onOpenApp }) {
  return (
    <div className="p-4 w-[22rem]" style={shellStyle}>
      <p className="text-sm text-secondary-text mb-3">{message}</p>
      <Button size="sm" onClick={onOpenApp}>
        Open bookmarkit
      </Button>
    </div>
  );
}

function PopupLoading() {
  return (
    <div className="p-6 w-[22rem] flex items-center justify-center" style={shellStyle}>
      <div
        className="animate-spin rounded-full h-5 w-5 border-b-2"
        style={{ borderColor: "var(--accent)" }}
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

const QuickAdd = () => {
  useTheme(); // applies the user's theme CSS variables to this popup too

  const { bookmarks, isLoading, init, saveBookmark, storeRef } = useBookmarkStore();
  useEffect(() => init(), [init]);

  const [tab, setTab] = useState(null);
  const [tabError, setTabError] = useState("");
  const [existing, setExisting] = useState(null);
  const [form, setForm] = useState({ title: "", url: "", tags: "", rating: 0, folderId: "" });
  const [status, setStatus] = useState({ state: "idle", message: "" });

  const folderOptions = useMemo(
    () => [...new Set(bookmarks.map((b) => b.folderId).filter(Boolean))],
    [bookmarks]
  );

  // #52: A right-click already knows what to bookmark, and for a link it knows
  // something this popup could not discover — the link's target is not the active
  // tab — so the target arrives in the query string. Otherwise the active tab is
  // the subject. url/title/favIconUrl are readable under the existing <all_urls>
  // host permission; no "tabs" permission needed.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search);
    const requestedUrl = requested.get("url");
    if (requestedUrl) {
      if (isSafeHttpUrl(requestedUrl))
        setTab({ url: requestedUrl, title: requested.get("title") || "" });
      else setTabError("That link can't be bookmarked (only http and https pages).");
      return;
    }
    (async () => {
      try {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!active || !isSafeHttpUrl(active.url)) {
          setTabError("This page can't be bookmarked (only http and https pages).");
          return;
        }
        setTab(active);
      } catch {
        setTabError("Couldn't read the current tab.");
      }
    })();
  }, []);

  // Prefill exactly once. `bookmarks` is a live subscription, so re-running this on
  // every store push would overwrite whatever the user had typed.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || !tab || isLoading) return;
    prefilledRef.current = true;

    const url = (tab.url || "").trim();
    const match = bookmarks.find((b) => (b.url || "").trim() === url);
    if (match) {
      setExisting(match);
      setForm({
        title: match.title || "",
        url: match.url || "",
        tags: (match.tags || []).join(", "),
        rating: match.rating || 0,
        folderId: match.folderId || "",
      });
    } else {
      setForm({ title: tab.title || url, url, tags: "", rating: 0, folderId: "" });
    }
  }, [tab, isLoading, bookmarks]);

  const handleSave = useCallback(async () => {
    if (status.state === "saving") return;
    const url = form.url.trim();
    if (!isSafeHttpUrl(url)) {
      setStatus({ state: "error", message: "Enter a valid http(s) URL." });
      return;
    }
    // saveBookmark no-ops (rather than throwing) on an uninitialized store, which
    // would otherwise show "Saved" for a write that never happened.
    if (!storeRef.current) {
      setStatus({ state: "error", message: "Store not ready — try again in a moment." });
      return;
    }
    setStatus({ state: "saving", message: "" });
    try {
      // Spread the existing bookmark first so fields this popup doesn't edit
      // (description, createdAt, urlStatus) survive an edit instead of being blanked.
      await saveBookmark({
        ...(existing || {}),
        id: existing?.id ?? null,
        title: form.title.trim() || url,
        url,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        rating: form.rating,
        folderId: form.folderId.trim(),
        // Prefer the favicon the tab already reports: it's accurate, and it means this
        // bookmark never needs the Google favicon fallback (#39).
        faviconUrl: existing?.faviconUrl || (isSafeHttpUrl(tab?.favIconUrl) ? tab.favIconUrl : ""),
      });
      setStatus({ state: "saved", message: existing ? "Updated" : "Saved" });
      setTimeout(() => window.close(), 700);
    } catch {
      setStatus({ state: "error", message: "Couldn't save. Try the full app." });
    }
  }, [form, existing, tab, saveBookmark, storeRef, status.state]);

  const openFullApp = useCallback(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
    window.close();
  }, []);

  // Enter saves from any single-line field; Escape closes the popup.
  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        window.close();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  if (tabError) return <PopupError message={tabError} onOpenApp={openFullApp} />;
  if (isLoading || !tab) return <PopupLoading />;

  const saving = status.state === "saving";
  const saved = status.state === "saved";

  return (
    <div className="p-3 w-[22rem] flex flex-col gap-2" style={shellStyle} onKeyDown={onKeyDown}>
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-primary-text">
          {existing ? "Edit bookmark" : "Add bookmark"}
        </h1>
        {existing && <Tag>Already saved</Tag>}
      </div>

      <QuickAddFields form={form} setForm={setForm} folderOptions={folderOptions} />

      <div className="flex items-center justify-between">
        <StarRating
          value={form.rating}
          onChange={(rating) => setForm((f) => ({ ...f, rating }))}
          buttonSemantics
        />
        <Button intent="ghost" size="sm" onClick={openFullApp}>
          Open full app
        </Button>
      </div>

      {status.state === "error" && <Banner tone="error">{status.message}</Banner>}

      <div className="flex gap-2 mt-1">
        <Button fullWidth onClick={handleSave} disabled={saving || saved} loading={saving}>
          {saving ? "Saving…" : saved ? `✓ ${status.message}` : existing ? "Update" : "Save"}
        </Button>
        <Button intent="secondary" onClick={() => window.close()}>
          Cancel
        </Button>
      </div>

      <p className="text-[10px] text-secondary-text text-center" aria-hidden="true">
        Enter to save · Esc to close
      </p>
    </div>
  );
};

export default QuickAdd;
