---
"bookmarkit": patch
---

Harden LLM response and error handling: a programming bug no longer reports itself as "could not
reach the LLM provider", plans wrapped in prose or in a second code fence are read instead of
silently coming back empty, a rate-limited provider asking for an hour surfaces the limit instead of
stalling the request, and following a URL redirect can no longer bounce between two URLs.
