import { describe, it, expect } from "vitest";
import {
  sortStepsByPriority,
  mergeAgentPlan,
  applyAgentPlan,
  findWithTags,
} from "./bookmarkFilters.js";

describe("sortStepsByPriority (#21)", () => {
  it("orders by numeric priority, lowest first", () => {
    const steps = [
      { action: "sortBookmarks", priority: 2 },
      { action: "searchBookmarks", priority: 1 },
    ];
    expect(sortStepsByPriority(steps).map((s) => s.action)).toEqual([
      "searchBookmarks",
      "sortBookmarks",
    ]);
  });

  it("is stable for equal priorities (keeps original order)", () => {
    const steps = [
      { action: "a", priority: 1 },
      { action: "b", priority: 1 },
    ];
    expect(sortStepsByPriority(steps).map((s) => s.action)).toEqual(["a", "b"]);
  });

  it("returns input order when no step has a priority", () => {
    const steps = [{ action: "b" }, { action: "a" }];
    expect(sortStepsByPriority(steps).map((s) => s.action)).toEqual(["b", "a"]);
  });
});

describe("mergeAgentPlan (#20)", () => {
  it("replaces a prior step of the same action instead of stacking", () => {
    const previous = [{ action: "searchBookmarks", parameters: { searchTerm: "react" } }];
    const steps = [{ action: "searchBookmarks", parameters: { searchTerm: "vue" } }];
    expect(mergeAgentPlan(previous, steps)).toEqual([
      { action: "searchBookmarks", parameters: { searchTerm: "vue" } },
    ]);
  });

  it("keeps prior steps of a different action (refinement)", () => {
    const previous = [{ action: "searchBookmarks", parameters: { searchTerm: "react" } }];
    const steps = [{ action: "sortBookmarks", parameters: { sortBy: "rating" } }];
    expect(mergeAgentPlan(previous, steps)).toEqual([...previous, ...steps]);
  });

  it("replaces a step in its original slot, not at the end (#32 ordering)", () => {
    const previous = [
      { action: "searchBookmarks", parameters: { searchTerm: "react" } },
      { action: "sortBookmarks", parameters: { sortBy: "rating" } },
    ];
    const steps = [{ action: "searchBookmarks", parameters: { searchTerm: "vue" } }];
    expect(mergeAgentPlan(previous, steps).map((s) => s.action)).toEqual([
      "searchBookmarks", // stays in slot 0, before the sort
      "sortBookmarks",
    ]);
  });

  it("collapses duplicate prior slots for a replaced action (#32 bound)", () => {
    const previous = [
      { action: "searchBookmarks", parameters: { searchTerm: "a" } },
      { action: "sortBookmarks", parameters: { sortBy: "rating" } },
      { action: "searchBookmarks", parameters: { searchTerm: "b" } },
    ];
    const steps = [{ action: "searchBookmarks", parameters: { searchTerm: "c" } }];
    const result = mergeAgentPlan(previous, steps);
    expect(result.map((s) => s.action)).toEqual(["searchBookmarks", "sortBookmarks"]);
    expect(result.filter((s) => s.action === "searchBookmarks")).toHaveLength(1);
    expect(result[0].parameters.searchTerm).toBe("c");
  });

  it("dedups repeated actions within a single incoming plan", () => {
    const steps = [
      { action: "searchBookmarks", parameters: { searchTerm: "x" } },
      { action: "searchBookmarks", parameters: { searchTerm: "y" } },
    ];
    const result = mergeAgentPlan([], steps);
    expect(result).toHaveLength(1);
    expect(result[0].parameters.searchTerm).toBe("y"); // last wins
  });

  it("clears the accumulated plan on reset/showAll", () => {
    const previous = [{ action: "searchBookmarks" }, { action: "sortBookmarks" }];
    expect(mergeAgentPlan(previous, [{ action: "resetSearch" }])).toEqual([
      { action: "resetSearch" },
    ]);
  });

  it("stays bounded to one step per action across repeated same-type queries", () => {
    let plan = [];
    for (const term of ["a", "b", "c", "d"]) {
      plan = mergeAgentPlan(plan, [
        { action: "searchBookmarks", parameters: { searchTerm: term } },
      ]);
    }
    expect(plan).toHaveLength(1);
    expect(plan[0].parameters.searchTerm).toBe("d");
  });

  it("normalizes a non-array previous plan", () => {
    const previous = { action: "searchBookmarks", parameters: { searchTerm: "old" } };
    const steps = [{ action: "sortBookmarks" }];
    expect(mergeAgentPlan(previous, steps)).toEqual([previous, ...steps]);
  });
});

describe("applyAgentPlan honors priority (#21)", () => {
  const list = [
    { id: "1", title: "Banana", rating: 5 },
    { id: "2", title: "apple", rating: 1 },
    { id: "3", title: "Cherry", rating: 3 },
  ];

  it("applies a lower-priority sort before a higher-priority limit regardless of array order", () => {
    // limit appears first in the array but has the higher priority number,
    // so the sort (priority 1) must run before the limit (priority 2).
    const plan = [
      { action: "limitFirst", parameters: { count: 1 }, priority: 2 },
      { action: "sortBookmarks", parameters: { sortBy: "rating", order: "desc" }, priority: 1 },
    ];
    const result = applyAgentPlan(plan, list);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1"); // highest rating after sort-then-limit
  });
});

// findWithTags had no direct coverage; the agent reaches it via the findWithTags action with
// LLM-produced tag values, so it needs the same normalization guarantees as the chip path (#58).
describe("findWithTags", () => {
  const list = [
    { id: "1", tags: [" docs ", "React"] },
    { id: "2", tags: ["docs"] },
    { id: "3", tags: ["news"] },
    { id: "4" },
  ];

  it("matches regardless of surrounding whitespace or case on either side", () => {
    expect(findWithTags(["docs"], [], list).map((b) => b.id)).toEqual(["1", "2"]);
    expect(findWithTags(["  DOCS  "], [], list).map((b) => b.id)).toEqual(["1", "2"]);
    expect(findWithTags(["react"], [], list).map((b) => b.id)).toEqual(["1"]);
  });

  it("requires every include tag to be present", () => {
    expect(findWithTags(["docs", "react"], [], list).map((b) => b.id)).toEqual(["1"]);
  });

  it("excludes on any matching exclude tag", () => {
    expect(findWithTags([], ["docs"], list).map((b) => b.id)).toEqual(["3", "4"]);
  });

  it("ignores blank query tags instead of blanking the view", () => {
    expect(findWithTags(["  "], [], list).map((b) => b.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("tolerates bookmarks with missing or non-array tags", () => {
    expect(findWithTags(["docs"], [], [{ id: "x" }, { id: "y", tags: "docs" }])).toEqual([]);
  });
});

// #46: the step the app writes when a vector search found things substring
// matching could not.
// #46: a widened search is still that search, so a new one has to displace it.
describe("mergeAgentPlan with a widened search (#46)", () => {
  const semantic = {
    action: "semanticMatches",
    parameters: { searchTerm: "pinecone", ids: ["3"] },
  };

  it("replaces a semantic search with the next plain search", () => {
    const merged = mergeAgentPlan(
      [semantic],
      [{ action: "searchBookmarks", parameters: { searchTerm: "sourdough" } }]
    );

    expect(merged).toEqual([
      { action: "searchBookmarks", parameters: { searchTerm: "sourdough" } },
    ]);
  });

  it("replaces a plain search with the widened one that answered it", () => {
    const merged = mergeAgentPlan(
      [{ action: "searchBookmarks", parameters: { searchTerm: "pinecone" } }],
      [semantic]
    );

    expect(merged).toEqual([semantic]);
  });

  it("leaves the other steps where they were", () => {
    const merged = mergeAgentPlan(
      [{ action: "filterByRating", parameters: { minRating: 4 } }, semantic],
      [{ action: "searchBookmarks", parameters: { searchTerm: "sourdough" } }]
    );

    expect(merged.map((step) => step.action)).toEqual(["filterByRating", "searchBookmarks"]);
  });
});

describe("applyAgentPlan with semanticMatches (#46)", () => {
  const list = [
    { id: "1", title: "Pinecone basics", url: "https://a.test", tags: [] },
    { id: "2", title: "Sourdough", url: "https://b.test", tags: [] },
    { id: "3", title: "Vector databases compared", url: "https://c.test", tags: [] },
  ];

  it("keeps the substring hits and adds the ranked ones after them", () => {
    const plan = [
      { action: "semanticMatches", parameters: { searchTerm: "pinecone", ids: ["3"] } },
    ];

    expect(applyAgentPlan(plan, list).map((b) => b.id)).toEqual(["1", "3"]);
  });

  it("is an ordinary search when the ranking is empty", () => {
    const plan = [{ action: "semanticMatches", parameters: { searchTerm: "pinecone", ids: [] } }];

    expect(applyAgentPlan(plan, list).map((b) => b.id)).toEqual(["1"]);
  });

  it("still narrows to the ranking when nothing matches literally", () => {
    const plan = [
      { action: "semanticMatches", parameters: { searchTerm: "storing vectors", ids: ["3", "1"] } },
    ];

    expect(applyAgentPlan(plan, list).map((b) => b.id)).toEqual(["3", "1"]);
  });

  it("survives a step with no ids at all", () => {
    const plan = [{ action: "semanticMatches", parameters: { searchTerm: "sourdough" } }];

    expect(applyAgentPlan(plan, list).map((b) => b.id)).toEqual(["2"]);
  });
});
