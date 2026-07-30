import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import QuickAdd from "./QuickAdd.jsx";

// The popup's whole job is turning "the active tab" into a store write, so the store
// and chrome.tabs are the two seams worth faking.
const store = {
  init: vi.fn().mockResolvedValue(undefined),
  list: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../stores/index.js", () => ({
  STORE_TYPES: { CHROME: "chrome", FIREBASE: "firebase", LOCAL: "local" },
  getStore: () => Promise.resolve(store),
}));

const EXISTING = {
  id: "b1",
  title: "Saved already",
  url: "https://example.com/page",
  description: "keep me",
  tags: ["old"],
  rating: 4,
  folderId: "Work",
  createdAt: "2020-01-01T00:00:00.000Z",
};

function mockChrome(tab) {
  globalThis.chrome = {
    tabs: {
      query: vi.fn().mockResolvedValue(tab ? [tab] : []),
      create: vi.fn(),
    },
    runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
    storage: {
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.list.mockResolvedValue([]);
  vi.stubGlobal("close", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.chrome;
});

describe("QuickAdd popup (#51)", () => {
  it("prefills from the active tab", async () => {
    mockChrome({
      title: "Example Page",
      url: "https://example.com/page",
      favIconUrl: "https://example.com/f.ico",
    });
    render(<QuickAdd />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Example Page"));
    expect(screen.getByLabelText("URL")).toHaveValue("https://example.com/page");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("saves a new bookmark with tags, rating, folder and the tab's own favicon", async () => {
    mockChrome({
      title: "Example Page",
      url: "https://example.com/page",
      favIconUrl: "https://example.com/f.ico",
    });
    render(<QuickAdd />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Example Page"));

    fireEvent.change(screen.getByLabelText("Tags, comma separated"), {
      target: { value: "a, b ,, c" },
    });
    fireEvent.change(screen.getByLabelText("Folder"), { target: { value: "Work/API" } });
    fireEvent.click(screen.getByRole("button", { name: /^3 stars/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.create).toHaveBeenCalled());
    const saved = store.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      title: "Example Page",
      url: "https://example.com/page",
      tags: ["a", "b", "c"],
      rating: 3,
      folderId: "Work/API",
      // Using the tab's real favicon means this bookmark never hits the Google
      // favicon fallback (#39).
      faviconUrl: "https://example.com/f.ico",
    });
    expect(store.update).not.toHaveBeenCalled();
  });

  it("detects an already-bookmarked URL and updates instead of duplicating", async () => {
    store.list.mockResolvedValue([EXISTING]);
    mockChrome({ title: "Fresh title from tab", url: "https://example.com/page" });
    render(<QuickAdd />);

    await waitFor(() => expect(screen.getByText("Already saved")).toBeInTheDocument());
    // Prefills from the stored bookmark, not the tab.
    expect(screen.getByLabelText("Title")).toHaveValue("Saved already");
    expect(screen.getByLabelText("Tags, comma separated")).toHaveValue("old");
    expect(screen.getByLabelText("Folder")).toHaveValue("Work");

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(store.update).toHaveBeenCalled());
    expect(store.create).not.toHaveBeenCalled();

    const [id, patch] = store.update.mock.calls[0];
    expect(id).toBe("b1");
    // Fields the popup doesn't edit must survive the round-trip.
    expect(patch.description).toBe("keep me");
    expect(patch.createdAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("refuses to bookmark a non-http page", async () => {
    mockChrome({ title: "Settings", url: "chrome://settings" });
    render(<QuickAdd />);
    await waitFor(() => expect(screen.getByText(/can't be bookmarked/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("does not overwrite what the user typed when the store pushes an update", async () => {
    let pushSubscriber;
    store.subscribe.mockImplementation((cb) => {
      pushSubscriber = cb;
      return () => {};
    });
    mockChrome({ title: "Example Page", url: "https://example.com/page" });
    render(<QuickAdd />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Example Page"));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My own title" } });
    // A live subscription push must not re-run the prefill over the user's edit.
    // act() forces the resulting re-render (and any effect it triggers) to flush before
    // we assert — a bare waitFor would pass on its first poll, before the clobber lands.
    await act(async () => {
      pushSubscriber([{ id: "zz", url: "https://other.com", title: "Other" }]);
    });

    expect(screen.getByLabelText("Title")).toHaveValue("My own title");
  });

  it("surfaces a save failure instead of reporting success", async () => {
    store.create.mockRejectedValueOnce(new Error("quota"));
    mockChrome({ title: "Example Page", url: "https://example.com/page" });
    render(<QuickAdd />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Example Page"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/));
    expect(globalThis.close).not.toHaveBeenCalled();
  });

  it("opens the full app in a tab", async () => {
    mockChrome({ title: "Example Page", url: "https://example.com/page" });
    render(<QuickAdd />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Example Page"));

    fireEvent.click(screen.getByRole("button", { name: "Open full app" }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://abc/index.html" });
  });
});

// #52: A right-click opens this popup as its own window with the target in the
// query string, because the popup cannot discover a link's address for itself —
// the link is not the active tab.
describe("QuickAdd opened for a given target (#52)", () => {
  const openedFor = (search) => {
    window.history.replaceState({}, "", `/popup.html${search}`);
  };

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("prefills from the query string rather than the active tab", async () => {
    mockChrome({ title: "The page it sat on", url: "https://example.com/page" });
    openedFor("?url=https%3A%2F%2Flinked.test%2Ftarget&title=The+link+text");

    render(<QuickAdd />);

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("The link text"));
    expect(screen.getByLabelText("URL")).toHaveValue("https://linked.test/target");
    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });

  it("falls back to the address when no title came with it", async () => {
    mockChrome({ title: "The page it sat on", url: "https://example.com/page" });
    openedFor("?url=https%3A%2F%2Flinked.test%2Ftarget");

    render(<QuickAdd />);

    await waitFor(() =>
      expect(screen.getByLabelText("Title")).toHaveValue("https://linked.test/target")
    );
  });

  it("refuses a target it would not open", async () => {
    mockChrome({ title: "The page it sat on", url: "https://example.com/page" });
    openedFor("?url=javascript%3Aalert(1)");

    render(<QuickAdd />);

    await waitFor(() => expect(screen.getByText(/can't be bookmarked/)).toBeInTheDocument());
    expect(screen.queryByLabelText("URL")).toBeNull();
  });
});
