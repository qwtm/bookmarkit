---
"bookmarkit": minor
---

Recover a dead link from an archived copy.

Once a sweep has found dead links, **Find Archived Copies** asks the Internet
Archive whether it kept a copy of each one and shows what it found as a diff. It
proposes: nothing is re-pointed until you accept it, and accepting is one undo
however many links changed.

It asks about the dead links you have selected, or the ones on screen when nothing
is selected — so a folder, a search or a selection is how you scope it. Only public
http(s) addresses are asked about, the request goes to one hard-coded host with the
bookmark's URL as a parameter, and the snapshot address that comes back is
validated as a public https address on the archive's own host before it can reach a
bookmark. Recovered bookmarks are marked for re-checking rather than assumed good.
