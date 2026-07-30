---
"bookmarkit": patch
---

Internal restructuring of the full app with no change in behaviour: the LLM provider settings and
their passphrase lock, the agent request lifecycle, bookmark selection, and the undo offer each moved
out of the one large component into their own hook. They are now covered by tests, which the rules
inside them — the API key never reaching synced storage, a failed encryption write keeping the key, a
superseded agent reply being discarded — previously were not.
