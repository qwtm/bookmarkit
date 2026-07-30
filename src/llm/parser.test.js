import { describe, it, expect } from "vitest";
import { parseAgentResponse } from "./parser.js";

describe("parseAgentResponse", () => {
  it("returns [] for empty input", () => {
    expect(parseAgentResponse("")).toEqual([]);
    expect(parseAgentResponse(null)).toEqual([]);
  });

  it("parses a fenced ```json block", () => {
    const text = '```json\n[{"action":"showAllBookmarks"}]\n```';
    expect(parseAgentResponse(text)).toEqual([{ action: "showAllBookmarks", parameters: {} }]);
  });

  it("parses a bare JSON object and wraps it into an array", () => {
    expect(parseAgentResponse('{"action":"resetSearch"}')).toEqual([
      { action: "resetSearch", parameters: {} },
    ]);
  });

  it("drops steps with unknown actions", () => {
    const text = '[{"action":"nukeEverything"},{"action":"resetSearch"}]';
    expect(parseAgentResponse(text)).toEqual([{ action: "resetSearch", parameters: {} }]);
  });

  it("sanitizes an unknown field back to the default", () => {
    const text = '[{"action":"findIncludes","parameters":{"field":"bogus","value":"x"}}]';
    expect(parseAgentResponse(text)).toEqual([
      { action: "findIncludes", parameters: { field: "title", value: "x" } },
    ]);
  });

  it("drops a step when a required numeric param is invalid", () => {
    const text = '[{"action":"limitResults","parameters":{"count":"abc"}}]';
    expect(parseAgentResponse(text)).toEqual([]);
  });

  // #44: "clean up my bookmarks" means all three fields; anything else named is
  // dropped rather than defaulted, so a plan cannot ask to rewrite titles.
  it("keeps the organize fields it knows and drops the rest", () => {
    const text =
      '[{"action":"organizeBookmarks","parameters":{"fields":["tags","title","folderId"]}}]';
    expect(parseAgentResponse(text)).toEqual([
      { action: "organizeBookmarks", parameters: { fields: ["tags", "folderId"] } },
    ]);
  });

  it("organizes everything when no field is named", () => {
    expect(parseAgentResponse('[{"action":"organizeBookmarks"}]')).toEqual([
      { action: "organizeBookmarks", parameters: { fields: ["tags", "folderId", "description"] } },
    ]);
  });

  it("reads `folder` as the folder field, which is what the wording suggests", () => {
    const text = '[{"action":"organizeBookmarks","parameters":{"fields":["folder"]}}]';
    expect(parseAgentResponse(text)).toEqual([
      { action: "organizeBookmarks", parameters: { fields: ["folderId"] } },
    ]);
  });

  it("refuses a tidy-up of only fields it cannot touch, rather than doing the rest", () => {
    const text = '[{"action":"organizeBookmarks","parameters":{"fields":["title"]}}]';
    expect(parseAgentResponse(text)).toEqual([]);
  });

  it("preserves a numeric priority", () => {
    const text = '[{"action":"resetSearch","priority":2}]';
    expect(parseAgentResponse(text)).toEqual([
      { action: "resetSearch", parameters: {}, priority: 2 },
    ]);
  });

  it("coerces tag params to string arrays", () => {
    const text = '[{"action":"findWithTags","parameters":{"includeTags":"news"}}]';
    expect(parseAgentResponse(text)).toEqual([
      { action: "findWithTags", parameters: { includeTags: ["news"], excludeTags: [] } },
    ]);
  });

  it("extracts a fenced block even with surrounding prose", () => {
    const text =
      'Sure! Here is the plan:\n```json\n[{"action":"showAllBookmarks"}]\n```\nHope that helps.';
    expect(parseAgentResponse(text)).toEqual([{ action: "showAllBookmarks", parameters: {} }]);
  });

  it("returns [] on unparseable text", () => {
    expect(parseAgentResponse("sorry, I cannot help with that")).toEqual([]);
  });

  it("reads JSON surrounded by unfenced prose (#28)", () => {
    const text = 'Here is the plan: [{"action":"resetSearch"}] — let me know if that works.';
    expect(parseAgentResponse(text)).toEqual([{ action: "resetSearch", parameters: {} }]);
  });

  it("tries later fenced blocks when the first is not the plan (#28)", () => {
    const text =
      "First, my reasoning:\n```\nthe user wants everything\n```\n" +
      'Now the plan:\n```json\n[{"action":"showAllBookmarks"}]\n```';
    expect(parseAgentResponse(text)).toEqual([{ action: "showAllBookmarks", parameters: {} }]);
  });

  it("is not confused by braces inside a search term (#28)", () => {
    const text = 'Plan: [{"action":"searchBookmarks","parameters":{"searchTerm":"} ] awkward"}}]';
    expect(parseAgentResponse(text)).toEqual([
      { action: "searchBookmarks", parameters: { searchTerm: "} ] awkward" } },
    ]);
  });

  it("unwraps a provider API envelope (#28)", () => {
    const envelope = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '[{"action":"resetSearch"}]' }] } }],
    });
    expect(parseAgentResponse(envelope, "gemini")).toEqual([
      { action: "resetSearch", parameters: {} },
    ]);
  });

  it("keeps looking past a format example the model wrote first (#28)", () => {
    const text =
      'Each step looks like {"action": "<name>", "parameters": {}}.\n' +
      'Here is yours: [{"action":"resetSearch"}]';
    expect(parseAgentResponse(text)).toEqual([{ action: "resetSearch", parameters: {} }]);
  });

  it("keeps looking past a brace that never closes (#28)", () => {
    const text = 'Something like { unfinished thought...\nPlan: [{"action":"showAllBookmarks"}]';
    expect(parseAgentResponse(text)).toEqual([{ action: "showAllBookmarks", parameters: {} }]);
  });

  it("unwraps an envelope whose text is itself fenced (#28)", () => {
    const envelope = JSON.stringify({
      choices: [{ message: { content: '```json\n[{"action":"showAllBookmarks"}]\n```' } }],
    });
    expect(parseAgentResponse(envelope, "openai")).toEqual([
      { action: "showAllBookmarks", parameters: {} },
    ]);
  });
});
