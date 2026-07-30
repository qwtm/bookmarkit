---
"bookmarkit": patch
---

Stop a bookmark refresh from running after the page that asked for it has gone. Changes made
elsewhere are gathered up for a moment before the list is reread, and closing the popup in that
moment left the reread scheduled against a browser API that was no longer there.
