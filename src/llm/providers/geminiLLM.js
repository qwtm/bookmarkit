// Gemini LLM provider
// Expects options: { apiKey?: string, model?: string }

export function createGeminiLLM({ apiKey = '', model = 'gemini-2.0-flash' } = {}, baseUrl = 'https://generativelanguage.googleapis.com') {
  const endpoint = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const listEndpoint = `${baseUrl}/v1beta/models`;

  return {
    name: 'gemini',
    // SEC-02: API key sent via x-goog-api-key header instead of URL query param
    // to prevent key exposure in browser history, server logs, and referrer headers.
    async generate(prompt, signal) {
      const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-goog-api-key'] = apiKey;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });
      if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
    async listModels() {
      const fallback = [model, 'gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro', 'gemini-1.5-flash']
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      // If no API key, return fallback
      if (!apiKey) return fallback;
      try {
        const res = await fetch(listEndpoint, {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
        });
        if (!res.ok) return fallback;
        const data = await res.json();
        const names = (data?.models || [])
          .map((m) => m?.name?.replace('models/', '') || '')
          .filter(Boolean);
        const unique = Array.from(new Set([model, ...names]));
        return unique;
      } catch {
        return fallback;
      }
    },
  };
}
