// OpenAI (ChatGPT) provider
// Expects options: { apiKey?: string, model?: string, baseUrl?: string }
// ARCH-02: generate() uses fetchWithRetry (30s timeout, up to 3 attempts).
// ARCH-05: Fixed Authorization: undefined bug — header omitted when no API key.
// ARCH-05: generate() accepts an optional AbortSignal for ARCH-04 cancellation.

import { fetchWithRetry } from '../retry.js';

export function createOpenAILLM({ apiKey = '', model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1' } = {}) {
  return {
    name: 'openai',
    async generate(prompt, signal) {
      const res = await fetchWithRetry(
        `${baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // ARCH-05: Only include Authorization when apiKey is non-empty to avoid
            // sending the literal string "undefined" as a header value.
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a helpful assistant.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0,
          }),
        },
        {},
        signal,
      );
      if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || '';
    },
    async listModels() {
      const fallback = [model, 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-3.5-turbo']
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      if (!apiKey) return fallback;
      try {
        const res = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return fallback;
        const data = await res.json();
        const names = (data?.data || [])
          .map((m) => m?.id)
          .filter(Boolean);
        return Array.from(new Set([model, ...names]));
      } catch {
        return fallback;
      }
    },
  };
}
