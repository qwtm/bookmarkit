import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { embedTexts, embeddingSource, supportsEmbeddings } from "./embeddings.js";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  delete globalThis.fetch;
});

describe("supportsEmbeddings", () => {
  it("knows which providers can embed", () => {
    expect(supportsEmbeddings("gemini")).toBe(true);
    expect(supportsEmbeddings("OpenAI")).toBe(true);
    expect(supportsEmbeddings("ollama")).toBe(true);
    expect(supportsEmbeddings("lmstudio")).toBe(true);
    // Grok has no embeddings endpoint.
    expect(supportsEmbeddings("grok")).toBe(false);
    expect(supportsEmbeddings("")).toBe(false);
  });
});

describe("embedTexts", () => {
  it("asks Gemini for a batch and returns the vectors in order", async () => {
    globalThis.fetch.mockResolvedValue(
      ok({ embeddings: [{ values: [1, 2] }, { values: [3, 4] }] })
    );

    const vectors = await embedTexts("gemini", { apiKey: "k" }, ["a", "b"]);

    expect(vectors).toEqual([
      [1, 2],
      [3, 4],
    ]);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("batchEmbedContents");
    // SEC-02: the key is a header, never a query parameter.
    expect(init.headers["x-goog-api-key"]).toBe("k");
    expect(url).not.toContain("k");
  });

  it("asks OpenAI in its own shape", async () => {
    globalThis.fetch.mockResolvedValue(ok({ data: [{ embedding: [0.5] }] }));

    const vectors = await embedTexts("openai", { apiKey: "k" }, ["a"]);

    expect(vectors).toEqual([[0.5]]);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(init.headers.Authorization).toBe("Bearer k");
  });

  // The chat providers disagree about what a configured base URL means, and a
  // setting that works for chat must not break search.
  it("treats a configured OpenAI base as the v1 root, as the chat provider does", async () => {
    globalThis.fetch.mockResolvedValue(ok({ data: [{ embedding: [1] }] }));

    await embedTexts("openai", { apiKey: "k", baseUrl: "https://api.openai.com/v1" }, ["a"]);

    expect(globalThis.fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/embeddings");
  });

  it("treats a configured LM Studio base as the host it listens on", async () => {
    globalThis.fetch.mockResolvedValue(ok({ data: [{ embedding: [1] }] }));

    await embedTexts("lmstudio", { baseUrl: "http://localhost:1234/" }, ["a"]);

    expect(globalThis.fetch.mock.calls[0][0]).toBe("http://localhost:1234/v1/embeddings");
  });

  it("asks Ollama once per text, since that is its API", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(ok({ embedding: [1] }))
      .mockResolvedValueOnce(ok({ embedding: [2] }));

    const vectors = await embedTexts("ollama", { baseUrl: "http://localhost:11434" }, ["a", "b"]);

    expect(vectors).toEqual([[1], [2]]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("takes the model it is given", async () => {
    globalThis.fetch.mockResolvedValue(ok({ data: [{ embedding: [1] }] }));

    await embedTexts("openai", { apiKey: "k", embeddingModel: "text-embedding-3-large" }, ["a"]);

    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).model).toBe("text-embedding-3-large");
  });

  it("refuses a provider that cannot embed", async () => {
    await expect(embedTexts("grok", { apiKey: "k" }, ["a"])).rejects.toThrow(/cannot produce/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("asks nothing when there is nothing to embed", async () => {
    expect(await embedTexts("gemini", { apiKey: "k" }, [])).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // Vectors that cannot be lined up with the texts that went in would be filed
  // against the wrong bookmarks, which is worse than no index at all.
  it("refuses an answer with the wrong number of vectors", async () => {
    globalThis.fetch.mockResolvedValue(ok({ embeddings: [{ values: [1] }] }));

    await expect(embedTexts("gemini", { apiKey: "k" }, ["a", "b"])).rejects.toThrow(
      /did not match/
    );
  });

  it("reports a refusal from the provider", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    await expect(embedTexts("openai", { apiKey: "bad" }, ["a"])).rejects.toThrow(/401/);
  });
});

describe("embeddingSource", () => {
  it("names the provider, the model, and where it was asked", () => {
    expect(embeddingSource("openai", { baseUrl: "https://proxy.test/v1" })).toBe(
      "openai|text-embedding-3-small|https://proxy.test/v1"
    );
  });

  it("changes when the embedding model does, so a cached vector can be spotted", () => {
    expect(embeddingSource("openai", {})).not.toBe(
      embeddingSource("openai", { embeddingModel: "text-embedding-3-large" })
    );
  });
});
