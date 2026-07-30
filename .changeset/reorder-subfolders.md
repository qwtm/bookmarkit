---
"bookmarkit": patch
---

Saving a sort order now reaches bookmarks inside folders. Only root-level bookmarks were actually
moved, so a foldered collection kept its old order with no notice, even though the view showed it
sorted. The order is applied within each folder, and folders stay where you put them.
