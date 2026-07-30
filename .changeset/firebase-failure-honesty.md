---
"bookmarkit": patch
---

Stop Firebase mode from looking like your bookmarks disappeared. A dropped or refused connection
replaced the list with an empty one, so every bookmark vanished from the screen and a save from that
view would have been made against nothing. The last loaded list now stays put and the problem is
reported instead. A refused sign-in also used to leave the app loading forever; it now says what
went wrong, and a collection that could not be opened says so rather than showing an empty list you
could add to.
