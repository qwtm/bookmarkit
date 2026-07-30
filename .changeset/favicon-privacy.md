---
"bookmarkit": minor
---

Stop sending your bookmark domains to Google by default. Every bookmark without its own icon used
to request one from google.com on render, so opening the list reported the collection to a third
party. Icons now come from the bookmark, then the browser's own favicon cache, then a local
placeholder; the remote service is opt-in under Options → Privacy.
