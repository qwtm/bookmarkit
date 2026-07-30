---
"bookmarkit": patch
---

Release bookmark-store listeners on teardown, so remounting no longer accumulates Chrome bookmark
event listeners or Firestore snapshot subscriptions that keep firing into a discarded store.
