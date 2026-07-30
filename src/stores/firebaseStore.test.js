import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFirebaseStore } from "./firebaseStore.js";

// The Firebase SDK is replaced with the smallest surface the store touches, so
// the observers it registers can be driven directly.
const sdk = vi.hoisted(() => ({
  auth: [],
  snapshots: [],
  paths: [],
  signIn: () => Promise.resolve(),
}));

vi.mock("firebase/app", () => ({ initializeApp: () => ({}) }));

vi.mock("firebase/auth", () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_auth, next, onError) => {
    const observer = { next, onError, unsubscribed: false };
    sdk.auth.push(observer);
    return () => {
      observer.unsubscribed = true;
    };
  },
  signInAnonymously: () => sdk.signIn(),
  signInWithCustomToken: () => sdk.signIn(),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({}),
  enableIndexedDbPersistence: () => Promise.resolve(),
  collection: (_db, ...segments) => {
    const path = segments.join("/");
    sdk.paths.push(path);
    return { path };
  },
  doc: () => ({}),
  onSnapshot: (_query, next, onError) => {
    sdk.snapshots.push({ next, onError });
    return () => {};
  },
  query: (ref) => ref,
  orderBy: () => ({}),
  getDocs: () => ({ docs: [] }),
  addDoc: () => ({ id: "new" }),
  setDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(),
  writeBatch: () => ({ set: () => {}, delete: () => {}, commit: () => Promise.resolve() }),
}));

const newStore = (options) =>
  createFirebaseStore({ firebaseConfig: { apiKey: "k" }, appId: "app", ...options });

// Let the store register its auth observer, then answer it.
const answerAuth = async (user) => {
  await Promise.resolve();
  sdk.auth.at(-1).next(user);
  await Promise.resolve();
};

describe("firebaseStore sign-in (#18)", () => {
  beforeEach(() => {
    sdk.auth.length = 0;
    sdk.snapshots.length = 0;
    sdk.paths.length = 0;
    sdk.signIn = () => Promise.resolve();
  });

  it("fails init when sign-in is refused, instead of carrying on with no user", async () => {
    sdk.signIn = () => Promise.reject(new Error("auth/admin-restricted-operation"));
    const store = newStore();

    const init = store.init();
    await answerAuth(null);

    await expect(init).rejects.toThrow(/sign-in failed.*admin-restricted/u);
    // The path that would have been built is artifacts/app/users/null/bookmarks.
    expect(sdk.paths.some((path) => path.includes("null"))).toBe(false);
    expect(sdk.auth.at(-1).unsubscribed).toBe(true);
  });

  it("fails init when the auth observer itself errors", async () => {
    const store = newStore();

    const init = store.init();
    await Promise.resolve();
    sdk.auth.at(-1).onError(new Error("network-request-failed"));

    await expect(init).rejects.toThrow(/sign-in failed.*network-request-failed/u);
  });

  it("reads the signed-in user's own collection", async () => {
    const store = newStore();

    const init = store.init();
    await answerAuth({ uid: "user-1" });
    await init;

    expect(sdk.paths).toContain("artifacts/app/users/user-1/bookmarks");
  });
});

describe("firebaseStore snapshot failures (#18)", () => {
  beforeEach(() => {
    sdk.auth.length = 0;
    sdk.snapshots.length = 0;
    sdk.paths.length = 0;
    sdk.signIn = () => Promise.resolve();
  });

  const initialized = async (options) => {
    const store = newStore(options);
    const init = store.init();
    await answerAuth({ uid: "user-1" });
    await init;
    return store;
  };

  it("keeps the last list when the subscription drops, rather than emptying it", async () => {
    const onError = vi.fn();
    const store = await initialized({ onError });
    const emissions = [];
    store.subscribe((all) => emissions.push(all));

    sdk.snapshots.at(-1).next({ docs: [{ id: "a", data: () => ({ title: "A" }) }] });
    expect(emissions).toEqual([[{ id: "a", title: "A" }]]);

    // An expired token, a rules change, or a dropped connection.
    sdk.snapshots.at(-1).onError(new Error("permission-denied"));

    // No second emission: subscribers still hold the list they were given.
    expect(emissions).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "permission-denied" }));
  });

  it("does not require an onError handler", async () => {
    const store = await initialized();
    store.subscribe(() => {});
    expect(() => sdk.snapshots.at(-1).onError(new Error("permission-denied"))).not.toThrow();
  });
});
