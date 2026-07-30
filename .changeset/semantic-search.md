---
"bookmarkit": minor
---

Search now understands meaning as well as spelling. With a provider that offers
embeddings (Gemini, OpenAI, Ollama, LM Studio), "that article about vector
databases" finds the bookmark titled "Pinecone basics". Exact matches stay at the
top and nothing is taken away, so a search never gets worse.

Each bookmark is embedded once and cached locally under a fingerprint of its text,
so only edited bookmarks are re-embedded and matching stays local. That also mends
the old fallback cliff: when the agent request fails, the natural-language query
still finds things instead of degrading into a substring search for the whole
sentence.
