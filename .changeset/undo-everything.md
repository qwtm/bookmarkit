---
"bookmarkit": minor
---

Undo now covers every change, not just deleting and sorting. Edits, adds,
imports, de-duplication, and "replace all" can all be taken back, and Cmd/Ctrl+Z
walks back through the last ten changes even after their toasts have gone.

Undo is derived from the write itself rather than snapshotted at the call site,
so a restored delete or overwrite brings back tags, ratings, folders, and notes
along with the bookmarks. Destructive changes keep their offer until it is used
or dismissed instead of expiring on a timer.
