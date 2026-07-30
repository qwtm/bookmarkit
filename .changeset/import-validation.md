---
"bookmarkit": patch
---

Let you retry a failed import, and stop a hand-edited file from writing junk into your collection.
Picking the same file twice in a row did nothing, because the browser only reports a change when the
selection changes, so a rejected file could not be corrected and re-picked. A JSON import is now also
checked before you confirm it: the count you approve is the number of bookmarks that will actually be
added, entries without an openable http(s) address are named as skipped instead of silently dropped,
and fields like a rating of "4" or tags written as one comma-separated string are normalised at the
boundary rather than breaking the list later.
