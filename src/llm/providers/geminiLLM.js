// Gemini LLM provider
// Expects options: { apiKey?: string, model?: string }
// ARCH-02: generate() uses fetchWithRetry (30s timeout, up to 3 attempts).
// ARCH-05: generate() accepts an optional AbortSignal for ARCH-04 cancellation.

import { fetchWithRetry } from '../retry.js';

export function createGeminiLLM({ apiKey = '', model = 'gemini-2.0-flash' } = {}, baseUrl = 'https://generativelanguage.googleapis.com') {
  const endpoint = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const listEndpoint = `${baseUrl}/v1beta/models`;

  return {
    name: 'gemini',
    async generate(prompt, signal) {
      const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      const url = `${endpoint}?key=${apiKey || ''}`;
      const res = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        {},
        signal,
      );
      if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
    async listModels() {
      const fallback = [model, 'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro', 'gemini-1.5-flash']
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      if (!apiKey) return fallback;
      try {
        const url = `${listEndpoint}?key=${apiKey}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) return fallback;
        const data = await res.json();
        const names = (data?.models || [])
          .map((m) => m?.name?.replace('models/', '') || '')
          .filter(Boolean);
        return Array.from(new Set([model, ...names]));
      } catch {
        return fallback;
      }
    },
  };
}
