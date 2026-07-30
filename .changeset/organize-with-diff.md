---
"bookmarkit": minor
---

"Clean up my bookmarks" asks your LLM for tags, folders, and missing descriptions
across the bookmarks in view, and shows the result as a diff: one row per
bookmark, every row ticked, unticking anything you disagree with. Nothing is
written until you apply, and applying counts as a single change, so one
Cmd/Ctrl+Z puts the whole tidy-up back.

Titles and URLs are never proposed, existing tags and descriptions are added to
rather than replaced, and a suggested folder is matched against the folders
already in use instead of becoming a second one beside them. Large collections are
asked about in slices with progress and a Stop button.
