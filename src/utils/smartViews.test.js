import { describe, it, expect } from "vitest";
import {
  MAX_VIEWS,
  addView,
  isViewWorthSaving,
  makeView,
  matchingViewId,
  readViews,
  removeView,
  sanitizeView,
  serializeViews,
} from "./smartViews.js";
import { EMPTY_FILTERS } from "./manualFilters.js";

const plan = [{ action: "findWithTags", parameters: { includeTags: ["ml"], excludeTags: [] } }];
const filters = { ...EMPTY_FILTERS, minRating: 4 };

describe("saved views (#49)", () => {
  it("keeps the plan and the filters a view was saved with", () => {
    const view = makeView("Unread ML papers", plan, filters);

    expect(view.name).toBe("Unread ML papers");
    expect(view.plan).toEqual(plan);
    expect(view.filters.minRating).toBe(4);
    expect(view.id).toBeTruthy();
  });

  it("saves a view that is only filters, or only a plan", () => {
    expect(makeView("Four stars", null, filters)).not.toBeNull();
    expect(makeView("Tagged ml", plan, EMPTY_FILTERS)).not.toBeNull();
  });

  it("refuses a view that would restore nothing", () => {
    expect(makeView("Empty", null, EMPTY_FILTERS)).toBeNull();
    expect(makeView("", plan, filters)).toBeNull();
    expect(makeView("   ", plan, filters)).toBeNull();
    expect(isViewWorthSaving(null, EMPTY_FILTERS)).toBe(false);
    expect(isViewWorthSaving(plan, EMPTY_FILTERS)).toBe(true);
    expect(isViewWorthSaving(null, filters)).toBe(true);
  });

  it("accepts a single step as a plan, the way the app holds one", () => {
    const view = makeView("One step", plan[0], EMPTY_FILTERS);

    expect(view.plan).toEqual(plan);
  });
});

describe("reading views back (#49)", () => {
  it("survives a round trip through storage", () => {
    const saved = addView([], makeView("Unread ML papers", plan, filters));

    expect(readViews(serializeViews(saved))).toEqual(saved);
  });

  // The whole point of validating on load: storage is editable, and applyAgentPlan
  // should never be handed an action the parser would have refused.
  it("drops an action the parser does not know", () => {
    const stored = serializeViews([
      {
        id: "v1",
        name: "Smuggled",
        plan: [{ action: "deleteEverything", parameters: {} }, ...plan],
        filters: EMPTY_FILTERS,
      },
    ]);

    expect(readViews(stored)[0].plan).toEqual(plan);
  });

  it("drops a view whose plan was nothing but unknown actions", () => {
    const stored = serializeViews([
      {
        id: "v1",
        name: "Smuggled",
        plan: [{ action: "deleteEverything", parameters: {} }],
        filters: EMPTY_FILTERS,
      },
    ]);

    expect(readViews(stored)).toEqual([]);
  });

  it("keeps only filter keys it knows, in the shapes it expects", () => {
    const stored = serializeViews([
      {
        id: "v1",
        name: "Odd",
        plan: [],
        filters: {
          text: 42,
          includeTags: "not-a-list",
          excludeTags: ["ok", null],
          minRating: 99,
          sortBy: "rm -rf",
          order: "sideways",
          extra: "dropped",
        },
      },
    ]);

    expect(readViews(stored)[0].filters).toEqual({
      text: "42",
      includeTags: [],
      excludeTags: ["ok"],
      minRating: 5,
      sortBy: "",
      order: "asc",
    });
  });

  it("keeps a sort field the filter bar really offers", () => {
    const stored = serializeViews([
      { id: "v1", name: "By rating", plan: [], filters: { ...EMPTY_FILTERS, sortBy: "rating" } },
    ]);

    expect(readViews(stored)[0].filters.sortBy).toBe("rating");
  });

  it("returns nothing for storage that is not a list of views", () => {
    expect(readViews(undefined)).toEqual([]);
    expect(readViews("{not json")).toEqual([]);
    expect(readViews('{"name":"solo"}')).toEqual([]);
    expect(readViews("[1, null, false]")).toEqual([]);
  });

  it("loses one corrupt view rather than the whole row", () => {
    const stored = serializeViews([null, { id: "v2", name: "Good", plan, filters: EMPTY_FILTERS }]);

    expect(readViews(stored).map((v) => v.name)).toEqual(["Good"]);
  });

  it("keeps names unique on the way in", () => {
    const stored = serializeViews([
      { id: "v1", name: "Same", plan, filters: EMPTY_FILTERS },
      { id: "v2", name: "same", plan, filters: filters },
    ]);

    expect(readViews(stored)).toHaveLength(1);
  });

  it("stops reading at the cap", () => {
    const stored = serializeViews(
      Array.from({ length: MAX_VIEWS + 5 }, (_, i) => ({
        id: `v${i}`,
        name: `View ${i}`,
        plan,
        filters: EMPTY_FILTERS,
      }))
    );

    expect(readViews(stored)).toHaveLength(MAX_VIEWS);
  });

  it("trims a name that would not fit on a chip", () => {
    const view = sanitizeView({ name: "x".repeat(200), plan, filters: EMPTY_FILTERS });

    expect(view.name).toHaveLength(60);
  });
});

describe("the saved list (#49)", () => {
  it("replaces a view of the same name instead of collecting duplicates", () => {
    const first = addView([], makeView("Reading", plan, EMPTY_FILTERS));
    const second = addView(first, makeView("reading", null, filters));

    expect(second).toHaveLength(1);
    expect(second[0].filters.minRating).toBe(4);
  });

  it("puts the newest first and drops the oldest once full", () => {
    let views = [];
    for (let i = 0; i < MAX_VIEWS + 1; i++) {
      views = addView(views, makeView(`View ${i}`, plan, EMPTY_FILTERS));
    }

    expect(views).toHaveLength(MAX_VIEWS);
    expect(views[0].name).toBe(`View ${MAX_VIEWS}`);
    expect(views.some((v) => v.name === "View 0")).toBe(false);
  });

  it("ignores a view that could not be made", () => {
    const views = addView([], null);

    expect(views).toEqual([]);
  });

  it("forgets one by id", () => {
    const views = addView([], makeView("Reading", plan, EMPTY_FILTERS));

    expect(removeView(views, views[0].id)).toEqual([]);
    expect(removeView(views, "other")).toEqual(views);
  });
});

describe("matchingViewId (#49)", () => {
  const views = [makeView("Tagged ml", plan, EMPTY_FILTERS), makeView("Four stars", null, filters)];

  it("recognises the view the screen is showing", () => {
    expect(matchingViewId(views, plan, EMPTY_FILTERS)).toBe(views[0].id);
    expect(matchingViewId(views, null, filters)).toBe(views[1].id);
  });

  it("recognises a single step as the plan it stands for", () => {
    expect(matchingViewId(views, plan[0], EMPTY_FILTERS)).toBe(views[0].id);
  });

  it("lets go once the screen no longer matches", () => {
    expect(matchingViewId(views, plan, filters)).toBeNull();
    expect(matchingViewId(views, null, EMPTY_FILTERS)).toBeNull();
    expect(matchingViewId([], plan, EMPTY_FILTERS)).toBeNull();
  });
});
