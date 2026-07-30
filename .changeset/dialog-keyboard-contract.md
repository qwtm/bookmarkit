---
"bookmarkit": patch
---

Every dialog now closes with Escape and keeps focus inside it. Only three of them did: the bookmark
form, Options, and Import/Export had no keyboard way out at all, and Tab could wander off into the
page behind them. The three that worked each listened on the document, so Escape also reached the
list behind the dialog — clearing your selection as it closed — and the Theme File Format dialog took
Options with it when dismissed. Escape now belongs to whichever dialog holds focus, and focus returns
to whatever opened it. App shortcuts no longer fire behind an open dialog, and `h` no longer toggles
the header while you are reading one.
