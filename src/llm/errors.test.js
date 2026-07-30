import { describe, it, expect } from "vitest";
import { classifyLLMError } from "./errors.js";

const categoryOf = (error) => classifyLLMError(error).category;

describe("classifyLLMError", () => {
  it("recognizes auth failures by status and by wording", () => {
    expect(categoryOf({ status: 401 })).toBe("api_key");
    expect(categoryOf(new Error("HTTP 403 Forbidden"))).toBe("api_key");
    expect(categoryOf(new Error("Invalid API key provided"))).toBe("api_key");
  });

  it("recognizes rate limiting", () => {
    expect(categoryOf({ status: 429 })).toBe("rate_limit");
    expect(categoryOf(new Error("You exceeded your quota"))).toBe("rate_limit");
  });

  it("recognizes parse failures", () => {
    expect(categoryOf(new SyntaxError("Unexpected token < in JSON at position 0"))).toBe("parse");
  });

  it("treats a fetch TypeError as a connectivity problem (#28)", () => {
    const chrome = new TypeError("Failed to fetch");
    const firefox = new TypeError("NetworkError when attempting to fetch resource.");
    const safari = new TypeError("Load failed");

    expect(categoryOf(chrome)).toBe("network");
    expect(categoryOf(firefox)).toBe("network");
    expect(categoryOf(safari)).toBe("network");
  });

  it("does not disguise a programming TypeError as a connectivity problem (#28)", () => {
    const bug = new TypeError("llm.generate is not a function");

    expect(categoryOf(bug)).toBe("generic");
    expect(classifyLLMError(bug).message).not.toMatch(/internet connection/u);
  });

  it("falls back to a generic message", () => {
    expect(categoryOf(new Error("something else entirely"))).toBe("generic");
    expect(categoryOf(undefined)).toBe("generic");
  });

  it("never returns the raw error text", () => {
    const { message } = classifyLLMError(new Error("secret-token-abc123 rejected"));
    expect(message).not.toContain("secret-token-abc123");
  });
});
