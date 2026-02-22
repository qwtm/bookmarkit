// LM Studio local server provider
// Expects options: { model?: string, baseUrl?: string }
// Default LM Studio server (REST): http://localhost:1234
// ARCH-02: generate() uses fetchWithRetry (30s timeout, up to 3 attempts).
// ARCH-05: generate() accepts an optional AbortSignal for ARCH-04 cancellation.

import { fetchWithRetry } from '../retry.js';

export function createLMStudioLLM({ model = 'lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF', baseUrl = 'http://localhost:1234' } = {}) {
  // LM Studio exposes OpenAI-compatible /v1 endpoints
  const base = baseUrl.replace(/\/$/, '');
  return {
    name: 'lmstudio',
    async generate(prompt, signal) {
      const res = await fetchWithRetry(
        `${base}/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a helpful assistant.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0,
            stream: false,
          }),
        },
        {},
        signal,
      );
      if (!res.ok) throw new Error(`LM Studio API error ${res.status}`);
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || '';
    },
    async listModels() {
      try {
        const res = await fetch(`${base}/v1/models`, { method: 'GET' });
        if (!res.ok) return [model];
        const data = await res.json();
        const names = (data?.data || [])
          .map((m) => m?.id)
          .filter(Boolean);
        return Array.from(new Set([model, ...names]));
      } catch {
        return [model];
      }
    },
  };
}
