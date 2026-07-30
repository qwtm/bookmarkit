import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry, retryAfterMs, MAX_RETRY_AFTER_MS } from "./retry.js";

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

function response(status, headers = {}) {
  return { status, headers: { get: (name) => headers[name] ?? null } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

describe("retryAfterMs (#28)", () => {
  it("reads delta-seconds", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs(" 0.5 ")).toBe(500);
  });

  it("reads an HTTP-date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

    expect(retryAfterMs("Mon, 01 Jan 2024 00:00:05 GMT")).toBe(5000);
  });

  it("ignores an absent, unusable, or already-past value", () => {
    expect(retryAfterMs(null)).toBe(0);
    expect(retryAfterMs("")).toBe(0);
    expect(retryAfterMs("soon")).toBe(0);
    expect(retryAfterMs("0")).toBe(0);
    expect(retryAfterMs("Mon, 01 Jan 2001 00:00:00 GMT")).toBe(0);
  });

  it("refuses a wait longer than the cap", () => {
    expect(retryAfterMs(String(MAX_RETRY_AFTER_MS / 1000 + 1))).toBe(Infinity);
    expect(retryAfterMs("3600")).toBe(Infinity);
  });
});

describe("fetchWithRetry Retry-After handling (#28)", () => {
  it("honors a short Retry-After instead of the backoff schedule", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429, { "Retry-After": "0.01" }))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://provider.test/v1", {}, { baseDelayMs: 5000 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when asked to wait longer than the cap", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429, { "Retry-After": "3600" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://provider.test/v1", {}, { baseDelayMs: 1 });

    // Surfaced to the caller rather than slept on or retried early.
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to backoff when the header is unusable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503, { "Retry-After": "whenever" }))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://provider.test/v1", {}, { baseDelayMs: 1 });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
