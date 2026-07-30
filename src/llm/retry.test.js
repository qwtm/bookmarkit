import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry } from "./retry.js";

// Reject with signal.reason on abort, the way the fetch spec specifies, so the
// per-attempt timeout reason reaches fetchWithRetry's catch unchanged.
function hangingFetch() {
  return vi.fn(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithRetry abort handling (#41)", () => {
  it("fails fast on a per-attempt timeout instead of retrying", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://provider.test/v1", {}, { timeoutMs: 5, baseDelayMs: 1 })
    ).rejects.toMatchObject({ name: "TimeoutError" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast when the caller cancels", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const caller = new AbortController();
    const pending = fetchWithRetry(
      "https://provider.test/v1",
      {},
      { timeoutMs: 1000, baseDelayMs: 1 },
      caller.signal
    );

    caller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still retries genuine transport failures", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://provider.test/v1", {}, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow("Failed to fetch");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
