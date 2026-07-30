// #46: Turning text into a vector, per provider.
//
// This sits beside the chat providers rather than inside them: an embedding is a
// different endpoint, a different model, and — for Grok, which has none — not
// available at all. Folding it into the LLMProvider interface would put a method
// on every provider that a third of them cannot implement.
//
// One shape out: an array of vectors, in the order the texts went in. Everything
// about what to embed, how to compare vectors, and when to re-embed is
// utils/semanticSearch.js; this is only the call.

import { fetchWithRetry } from "./retry.js";
import { LLM_PROVIDERS } from "./index.js";

/** Default embedding model per provider, overridable through provider options. */
const MODELS = {
  [LLM_PROVIDERS.GEMINI]: "text-embedding-004",
  [LLM_PROVIDERS.OPENAI]: "text-embedding-3-small",
  [LLM_PROVIDERS.OLLAMA]: "nomic-embed-text",
  [LLM_PROVIDERS.LMSTUDIO]: "text-embedding-nomic-embed-text-v1.5",
};

/** Whether this provider can embed at all. Grok has no embeddings endpoint. */
export const supportsEmbeddings = (provider) =>
  Object.prototype.hasOwnProperty.call(MODELS, String(provider ?? "").toLowerCase());

const jsonPost = async (url, headers, body, signal) => {
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    {},
    signal
  );
  if (!res.ok) throw new Error(`Embeddings API error ${res.status}`);
  return res.json();
};

/** OpenAI's shape, which LM Studio also serves. */
async function embedOpenAIShape(baseUrl, apiKey, model, texts, signal) {
  const data = await jsonPost(
    `${baseUrl}/v1/embeddings`,
    apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    { model, input: texts },
    signal
  );
  return (data?.data || []).map((entry) => entry?.embedding || []);
}

const EMBEDDERS = {
  async [LLM_PROVIDERS.GEMINI]({ apiKey, model, baseUrl }, texts, signal) {
    const url = `${baseUrl || "https://generativelanguage.googleapis.com"}/v1beta/models/${model}:batchEmbedContents`;
    const data = await jsonPost(
      url,
      apiKey ? { "x-goog-api-key": apiKey } : {},
      {
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
        })),
      },
      signal
    );
    return (data?.embeddings || []).map((entry) => entry?.values || []);
  },

  [LLM_PROVIDERS.OPENAI]: ({ apiKey, model, baseUrl }, texts, signal) =>
    embedOpenAIShape(baseUrl || "https://api.openai.com", apiKey, model, texts, signal),

  [LLM_PROVIDERS.LMSTUDIO]: ({ apiKey, model, baseUrl }, texts, signal) =>
    embedOpenAIShape(baseUrl || "http://localhost:1234", apiKey, model, texts, signal),

  // Ollama embeds one text per call, so a batch is a batch of calls. It runs
  // locally, which is what makes that acceptable.
  async [LLM_PROVIDERS.OLLAMA]({ model, baseUrl }, texts, signal) {
    const url = `${baseUrl || "http://localhost:11434"}/api/embeddings`;
    const vectors = [];
    for (const text of texts) {
      const data = await jsonPost(url, {}, { model, prompt: text }, signal);
      vectors.push(data?.embedding || []);
    }
    return vectors;
  },
};

/**
 * Vectors for these texts, in order.
 *
 * @param {string} provider
 * @param {object} options Provider options; `embeddingModel` overrides the default.
 * @param {string[]} texts
 * @param {AbortSignal} [signal]
 * @returns {Promise<number[][]>}
 * @throws When the provider cannot embed, or the request fails.
 */
export async function embedTexts(provider, options = {}, texts = [], signal) {
  const name = String(provider ?? "").toLowerCase();
  const embed = EMBEDDERS[name];
  if (!embed) throw new Error(`${provider || "This provider"} cannot produce embeddings`);
  if (texts.length === 0) return [];

  const model = options.embeddingModel || MODELS[name];
  const vectors = await embed({ ...options, model }, texts, signal);
  // A provider that answered with the wrong number of vectors cannot be lined up
  // with the texts that went in, and guessing which is which would mis-file them.
  if (vectors.length !== texts.length) throw new Error("Embeddings response did not match request");
  return vectors;
}
