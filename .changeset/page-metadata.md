---
"bookmarkit": minor
---

Suggestions now read the page instead of guessing from its URL. In the extension,
the background worker fetches the page — public http(s) only, no redirects
followed, HTML only, capped, and with cookies omitted — and its own title,
description and opening text go to the model inside the usual untrusted-data
containment. An empty title is filled in from the page; one you wrote is left
alone. The web build keeps working from the URL as before.
