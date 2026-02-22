# Firebase Setup for bookmarkit

## Required Composite Index

The `firebaseStore.js` queries Firestore with two `orderBy` clauses:

```js
orderBy('position', 'asc'), orderBy('title', 'asc')
```

Firestore requires a **composite index** for multi-field ordering. Without it,
the query performs a full collection scan on every read.

### Creating the index

1. Open the [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Firestore Database** → **Indexes**
3. Click **Add Index** and configure:
   - **Collection**: `bookmarks` (or the full path under your `appId`)
   - **Fields**: `position ASC`, `title ASC`
   - **Query scope**: Collection
4. Click **Create**

Alternatively, deploy via the Firebase CLI using `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "bookmarks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "position", "order": "ASCENDING" },
        { "fieldPath": "title", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Offline Persistence

`firebaseStore.init()` enables IndexedDB-based offline persistence via
`enableIndexedDbPersistence(db)`. This caches the bookmark collection locally
so the app loads instantly on repeat visits without a network round-trip.

**Known limitations:**
- Offline persistence only works in one browser tab at a time. If multiple tabs
  are open, only the first will have persistence enabled (others log a warning).
- Some older browsers do not support IndexedDB and will silently fall back to
  online-only mode.
