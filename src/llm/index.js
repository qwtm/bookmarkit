// ARCH-05: Lightweight LLM provider abstraction with formal interface documentation.

/**
 * @typedef {Object} LLMProvider
 * @property {string} name - Provider key (e.g. 'gemini', 'openai', 'ollama')
 * @property {(prompt: string, signal?: AbortSignal) => Promise<string>} generate
 *   Generate a text response from the given prompt.
 *   `signal` is an optional AbortSignal for ARCH-04 request cancellation.
 * @property {() => Promise<string[]>} listModels
 *   Return the list of available model identifiers for this provider.
 */

import { createGeminiLLM } from "./providers/geminiLLM.js";
import { createOpenAILLM } from "./providers/openaiLLM.js";
import { createGrokLLM } from "./providers/grokLLM.js";
import { createOllamaLLM } from "./providers/ollamaLLM.js";
import { createLMStudioLLM } from "./providers/lmstudioLLM.js";

export const LLM_PROVIDERS = {
  GEMINI: "gemini",
  OPENAI: "openai", // ChatGPT
  GROK: "grok",
  OLLAMA: "ollama",
  LMSTUDIO: "lmstudio",
};

/**
 * Providers that reach a third party, and need a key to be asked anything.
 * Ollama and LM Studio run on the user's own machine and need nothing.
 */
const KEY_REQUIRED = new Set([LLM_PROVIDERS.GEMINI, LLM_PROVIDERS.OPENAI, LLM_PROVIDERS.GROK]);

/**
 * Whether this provider can actually be asked something.
 *
 * A provider name alone is not consent: `gemini` is the default before anything
 * is configured, so a feature that read the name and called anyway would send
 * bookmark titles to a remote API for a request destined to fail on its missing
 * key. Anything that transmits user data on its own initiative — rather than
 * because the user typed a query — checks this first.
 *
 * @param {string} provider
 * @param {object} [options] The merged provider options, build-time ones included.
 * @returns {boolean}
 */
export function isProviderReady(provider, options = {}) {
  const p = (provider || "").toString().toLowerCase();
  if (!p) return false;
  if (!KEY_REQUIRED.has(p)) return true;
  return String(options?.apiKey ?? "").trim().length > 0;
}

export function createLLM(provider = LLM_PROVIDERS.GEMINI, options = {}) {
  const p = (provider || "").toString().toLowerCase();
  switch (p) {
    case LLM_PROVIDERS.OPENAI:
      return createOpenAILLM(options);
    case LLM_PROVIDERS.GROK:
      return createGrokLLM(options);
    case LLM_PROVIDERS.OLLAMA:
      return createOllamaLLM(options);
    case LLM_PROVIDERS.LMSTUDIO:
      return createLMStudioLLM(options);
    case LLM_PROVIDERS.GEMINI:
    default:
      return createGeminiLLM(options);
  }
}
