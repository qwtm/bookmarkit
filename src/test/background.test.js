// The service worker is copied into the package verbatim from public/, so it
// cannot live beside its test under src/ the way the rest of the code does. It
// registers its listeners at import time against a global `chrome`, so the fake
// has to be in place first and the module imported once per test.

import { describe, it, expect, vi, beforeEach } from "vitest";

const listeners = {};

const bookmark = (id, title, url) => ({ id, title, url });

const tree = (bookmarkitChildren) => [
  {
    id: "0",
    children: [
      {
        id: "1",
        title: "Bookmarks bar",
        children: bookmarkitChildren
          ? [{ id: "10", title: "bookmarkit", children: bookmarkitChildren }]
          : [],
      },
    ],
  },
];

const install = async (bookmarkitChildren) => {
  const on = (name) => ({
    addListener: (fn) => {
      listeners[name] = fn;
    },
  });
  const chrome = {
    runtime: {
      id: "self",
      getURL: (p) => `chrome-extension://self/${p}`,
      onMessage: on("message"),
      onInstalled: on("installed"),
    },
    omnibox: {
      onInputChanged: on("inputChanged"),
      onInputEntered: on("inputEntered"),
      setDefaultSuggestion: vi.fn(),
    },
    contextMenus: { create: vi.fn(), onClicked: on("menuClicked") },
    tabs: {
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    windows: { create: vi.fn().mockResolvedValue(undefined) },
    bookmarks: {
      getTree: vi.fn().mockResolvedValue(tree(bookmarkitChildren)),
      getSubTree: vi.fn(async () => [
        { id: "10", title: "bookmarkit", children: bookmarkitChildren },
      ]),
    },
  };
  vi.stubGlobal("chrome", chrome);
  vi.resetModules();
  await import("../../public/background.js");
  return chrome;
};

const saved = [
  bookmark("1", "React documentation", "https://react.dev/learn"),
  bookmark("2", "Vite guide", "https://vite.dev/guide/"),
  bookmark("3", "Tags & ratings <spec>", "https://example.test/spec"),
];

beforeEach(() => {
  for (const key of Object.keys(listeners)) delete listeners[key];
});

describe("omnibox suggestions (#52)", () => {
  const suggestionsFor = async (text) => {
    const suggest = vi.fn();
    await listeners.inputChanged(text, suggest);
    return suggest.mock.calls[0][0];
  };

  it("suggests the bookmarks whose title or address contains every word", async () => {
    await install(saved);

    expect(await suggestionsFor("react")).toEqual([
      {
        content: "https://react.dev/learn",
        description: "<match>React documentation</match> <dim>https://react.dev/learn</dim>",
      },
    ]);
    expect((await suggestionsFor("guide vite")).map((s) => s.content)).toEqual([
      "https://vite.dev/guide/",
    ]);
    expect(await suggestionsFor("react vite")).toEqual([]);
  });

  it("matches on the address too, not only the title", async () => {
    await install(saved);

    expect((await suggestionsFor("vite.dev")).map((s) => s.content)).toEqual([
      "https://vite.dev/guide/",
    ]);
  });

  // Chrome parses these descriptions as XML: one unescaped & or < and the whole
  // suggestion list is dropped.
  it("escapes a title that would otherwise break the suggestion list", async () => {
    await install(saved);

    const [suggestion] = await suggestionsFor("spec");

    expect(suggestion.description).toBe(
      "<match>Tags &amp; ratings &lt;spec&gt;</match> <dim>https://example.test/spec</dim>"
    );
  });

  it("says how many matched, and says so when nothing did", async () => {
    const chrome = await install(saved);

    await suggestionsFor("react");
    expect(chrome.omnibox.setDefaultSuggestion).toHaveBeenLastCalledWith({
      description: 'bookmarkit — 1 match for "react"',
    });

    await suggestionsFor("nothing here");
    expect(chrome.omnibox.setDefaultSuggestion).toHaveBeenLastCalledWith({
      description: 'bookmarkit — nothing saved matches "nothing here"',
    });
  });

  it("suggests nothing when the collection folder does not exist yet", async () => {
    await install(null);

    expect(await suggestionsFor("react")).toEqual([]);
  });

  it("reads bookmarks inside folders", async () => {
    await install([{ id: "11", title: "Work", children: [saved[0]] }]);

    expect((await suggestionsFor("react")).map((s) => s.content)).toEqual([
      "https://react.dev/learn",
    ]);
  });
});

describe("omnibox opening a result (#52)", () => {
  it("opens the address a picked suggestion handed back", async () => {
    const chrome = await install(saved);

    await listeners.inputEntered("https://vite.dev/guide/", "currentTab");

    expect(chrome.tabs.update).toHaveBeenCalledWith({ url: "https://vite.dev/guide/" });
  });

  it("opens the best match when the query was entered as typed", async () => {
    const chrome = await install(saved);

    await listeners.inputEntered("react", "currentTab");

    expect(chrome.tabs.update).toHaveBeenCalledWith({ url: "https://react.dev/learn" });
  });

  it("honours where the user asked for it", async () => {
    const chrome = await install(saved);

    await listeners.inputEntered("react", "newForegroundTab");
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: "https://react.dev/learn" });

    await listeners.inputEntered("react", "newBackgroundTab");
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({
      url: "https://react.dev/learn",
      active: false,
    });
  });

  it("opens nothing when nothing matched", async () => {
    const chrome = await install(saved);

    await listeners.inputEntered("nothing here", "currentTab");

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

describe("context menu quick add (#52)", () => {
  const openedUrl = (chrome) => new URL(chrome.windows.create.mock.calls[0][0].url);

  it("registers one item for pages and links", async () => {
    const chrome = await install(saved);

    listeners.installed();

    expect(chrome.contextMenus.create).toHaveBeenCalledWith({
      id: "bookmarkit-quick-add",
      title: "Bookmark with bookmarkit",
      contexts: ["page", "link"],
    });
  });

  it("bookmarks the page, with its title", async () => {
    const chrome = await install(saved);

    await listeners.menuClicked(
      { menuItemId: "bookmarkit-quick-add", pageUrl: "https://example.test/page" },
      { url: "https://example.test/page", title: "A page" }
    );

    const url = openedUrl(chrome);
    expect(url.pathname.endsWith("popup.html")).toBe(true);
    expect(url.searchParams.get("url")).toBe("https://example.test/page");
    expect(url.searchParams.get("title")).toBe("A page");
  });

  // The link is the point: its address is not the active tab's, so this is the
  // one thing quick add could not have worked out for itself.
  it("bookmarks the link, not the page it sits on", async () => {
    const chrome = await install(saved);

    await listeners.menuClicked(
      {
        menuItemId: "bookmarkit-quick-add",
        pageUrl: "https://example.test/page",
        linkUrl: "https://linked.test/target",
        selectionText: "the link text",
      },
      { url: "https://example.test/page", title: "A page" }
    );

    const url = openedUrl(chrome);
    expect(url.searchParams.get("url")).toBe("https://linked.test/target");
    expect(url.searchParams.get("title")).toBe("the link text");
  });

  it("refuses a target it would not open", async () => {
    const chrome = await install(saved);

    for (const linkUrl of ["javascript:alert(1)", "chrome://settings", "file:///etc/passwd"]) {
      await listeners.menuClicked({ menuItemId: "bookmarkit-quick-add", linkUrl }, {});
    }

    expect(chrome.windows.create).not.toHaveBeenCalled();
  });

  it("ignores a click on somebody else's menu item", async () => {
    const chrome = await install(saved);

    await listeners.menuClicked(
      { menuItemId: "some-other-extension", pageUrl: "https://example.test/" },
      {}
    );

    expect(chrome.windows.create).not.toHaveBeenCalled();
  });
});
