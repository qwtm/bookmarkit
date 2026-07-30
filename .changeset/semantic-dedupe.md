---
"bookmarkit": minor
---

"Remove Duplicates" can now spot the same article saved under two different URLs.
After the rule-based pass, a configured LLM is asked about the pairs no rule can
settle — a canonical link and a syndicated copy, a paginated page and its print
view — and its proposals appear in the usual confirmation dialog with the reason
for each pair shown. With no provider configured, or a key still locked, nothing
changes: the deterministic pass is the default and remains the whole of it.
