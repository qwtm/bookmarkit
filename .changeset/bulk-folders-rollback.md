---
"bookmarkit": patch
---

Keep imported folders in the real bookmark tree, and stop a failed replace from taking your
collection with it. Bulk imports put every bookmark flat under the `bookmarkit` root, so folders
showed up in Bookmarkit but `chrome://bookmarks` and every synced device saw one pile. Replacing all
bookmarks also deleted the old ones before writing the new ones; now the replacements are written
first and a failure part way through leaves the collection untouched.
