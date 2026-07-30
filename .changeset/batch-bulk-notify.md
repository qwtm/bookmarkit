---
"bookmarkit": patch
---

Stop the UI from freezing when importing or reordering a large collection. Chrome reports one event
per bookmark it touches, and each one rebuilt the whole list, so importing N bookmarks did N full
rescans. A write now refreshes the list once, however many bookmarks it covers.
