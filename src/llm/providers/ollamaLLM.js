// Ollama local provider
// Expects options: { model?: string, baseUrl?: string }
// ARCH-02: generate() uses fetchWithRetry (30s timeout, up to 3 attempts).
// ARCH-05: generate() accepts an optional AbortSignal for ARCH-04 cancellation.

import { fetchWithRetry } from '../retry.js';

export function createOllamaLLM({ model = 'llama3.1', baseUrl = 'http://localhost:11434' } = {}) {
  return {
    name: 'ollama',
    async generate(prompt, signal) {
      const res = await fetchWithRetry(
        `${baseUrl}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, stream: false }),
        },
        {},
        signal,
      );
      if (!res.ok) throw new Error(`Ollama API error ${res.status}`);
      const data = await res.json();
      return data?.response || '';
    },
    async listModels() {
      try {
        const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
        if (!res.ok) return [model];
        const data = await res.json();
        const names = (data?.models || [])
          .map((m) => m?.model || m?.name)
          .filter(Boolean);
        return Array.from(new Set([model, ...names]));
      } catch {
        return [model];
      }
    },
  };
}
