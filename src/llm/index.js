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

import { createGeminiLLM } from './providers/geminiLLM.js';
import { createOpenAILLM } from './providers/openaiLLM.js';
import { createGrokLLM } from './providers/grokLLM.js';
import { createOllamaLLM } from './providers/ollamaLLM.js';
import { createLMStudioLLM } from './providers/lmstudioLLM.js';

export const LLM_PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai', // ChatGPT
  GROK: 'grok',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
};

export function createLLM(provider = LLM_PROVIDERS.GEMINI, options = {}) {
  const p = (provider || '').toString().toLowerCase();
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
