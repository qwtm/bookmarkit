import { describe, it, expect } from "vitest";

import { isProviderReady } from "./index.js";

describe("isProviderReady", () => {
  // A provider name is not consent: `gemini` is the default before anything is
  // configured, so a feature that transmits on its own initiative must not read
  // the name and go.
  it("wants a key before a remote provider is asked anything", () => {
    expect(isProviderReady("gemini", {})).toBe(false);
    expect(isProviderReady("openai", { apiKey: "   " })).toBe(false);
    expect(isProviderReady("gemini", { apiKey: "k" })).toBe(true);
  });

  it("asks nothing of a provider running on this machine", () => {
    expect(isProviderReady("ollama", {})).toBe(true);
    expect(isProviderReady("lmstudio", {})).toBe(true);
  });

  it("is not ready with no provider at all", () => {
    expect(isProviderReady("", { apiKey: "k" })).toBe(false);
    expect(isProviderReady(null)).toBe(false);
  });
});
