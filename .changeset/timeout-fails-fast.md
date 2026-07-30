---
"bookmarkit": patch
---

Fail fast when an LLM request hits its timeout. A hung provider now surfaces after the 30s deadline
instead of silently retrying twice more and leaving the search spinner live for over a minute.
