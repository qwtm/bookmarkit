import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useSmartViews } from "./useSmartViews.js";
import { EMPTY_FILTERS } from "../utils/manualFilters.js";

const VIEWS_KEY = "bm_smart_views";
const plan = [{ action: "findWithTags", parameters: { includeTags: ["ml"], excludeTags: [] } }];

let smartViews;

const Probe = () => {
  smartViews = useSmartViews();
  return <span data-testid="names">{smartViews.views.map((v) => v.name).join(",") || "none"}</span>;
};

const names = () => screen.getByTestId("names").textContent;

const fakeChromeStorage = (initial = {}) => {
  const store = { ...initial };
  return {
    store,
    local: {
      get: vi.fn(async (keys) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).filter((k) => k in store).map((k) => [k, store[k]])
        )
      ),
      set: vi.fn(async (entries) => Object.assign(store, entries)),
      remove: vi.fn(async (key) => delete store[key]),
    },
  };
};

beforeEach(() => {
  smartViews = undefined;
  localStorage.clear();
});

afterEach(() => {
  delete globalThis.chrome;
});

describe("useSmartViews (#49)", () => {
  it("starts with nothing saved", async () => {
    render(<Probe />);

    await waitFor(() => expect(names()).toBe("none"));
  });

  it("keeps a saved view across a reload", async () => {
    const first = render(<Probe />);

    await act(async () => {
      smartViews.save("Unread ML papers", plan, EMPTY_FILTERS);
    });
    expect(names()).toBe("Unread ML papers");
    first.unmount();

    // A fresh mount reads what the last one wrote.
    smartViews = undefined;
    render(<Probe />);
    await waitFor(() => expect(names()).toBe("Unread ML papers"));
  });

  it("refuses a view with nothing in it", async () => {
    render(<Probe />);

    let saved;
    await act(async () => {
      saved = smartViews.save("Empty", null, EMPTY_FILTERS);
    });

    expect(saved).toBe(false);
    expect(names()).toBe("none");
  });

  it("forgets a view for good", async () => {
    render(<Probe />);

    await act(async () => {
      smartViews.save("Reading", plan, EMPTY_FILTERS);
    });
    const [view] = smartViews.views;

    await act(async () => {
      smartViews.forget(view.id);
    });

    expect(names()).toBe("none");
    expect(JSON.parse(localStorage.getItem(VIEWS_KEY))).toEqual([]);
  });

  it("prefers the extension's own storage when it is there", async () => {
    const chrome = fakeChromeStorage();
    globalThis.chrome = { storage: chrome };
    render(<Probe />);

    await act(async () => {
      smartViews.save("Reading", plan, EMPTY_FILTERS);
    });

    expect(chrome.local.set).toHaveBeenCalled();
    expect(JSON.parse(chrome.store[VIEWS_KEY])[0].name).toBe("Reading");
    expect(localStorage.getItem(VIEWS_KEY)).toBeNull();
  });

  // Storage is editable, so what comes back is sanitized rather than trusted.
  it("drops an unknown action a stored view was carrying", async () => {
    localStorage.setItem(
      VIEWS_KEY,
      JSON.stringify([
        {
          id: "v1",
          name: "Smuggled",
          plan: [{ action: "deleteEverything", parameters: {} }, ...plan],
          filters: EMPTY_FILTERS,
        },
      ])
    );

    render(<Probe />);

    await waitFor(() => expect(names()).toBe("Smuggled"));
    expect(smartViews.views[0].plan).toEqual(plan);
  });

  it("ignores storage it cannot read", async () => {
    localStorage.setItem(VIEWS_KEY, "{not json");

    render(<Probe />);

    await waitFor(() => expect(names()).toBe("none"));
  });
});
