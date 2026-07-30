import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { fetchUrlStatus } from "./urlStatus.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  delete globalThis.chrome;
  vi.unstubAllGlobals();
});

describe("fetchUrlStatus in the extension", () => {
  it("asks the worker, which is the only privileged fetch", async () => {
    const sendMessage = vi.fn((_message, respond) =>
      respond({ status: "valid", redirectUrl: null })
    );
    globalThis.chrome = { runtime: { id: "test", sendMessage } };

    await expect(fetchUrlStatus("https://example.com")).resolves.toEqual({
      status: "valid",
      redirectUrl: null,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("treats a worker that answered nothing as unreachable", async () => {
    globalThis.chrome = {
      runtime: { id: "test", sendMessage: (_m, respond) => respond(undefined) },
    };

    await expect(fetchUrlStatus("https://example.com")).resolves.toEqual({
      status: "invalid",
      redirectUrl: null,
    });
  });
});

describe("fetchUrlStatus in the web build", () => {
  it("reports a URL that answers", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, type: "basic" });

    await expect(fetchUrlStatus("https://example.com")).resolves.toEqual({
      status: "valid",
      redirectUrl: null,
    });
  });

  // #10: the request leaves the browser even when the response is unreadable, so a
  // public URL answering 30x with an internal Location must not be followed here
  // either. The answer is "reachable, target not disclosed", as in the worker.
  it("does not follow a redirect, and does not hand its target back", async () => {
    globalThis.fetch.mockResolvedValue({
      type: "opaqueredirect",
      ok: false,
      url: "http://127.0.0.1/",
    });

    await expect(fetchUrlStatus("https://example.com")).resolves.toEqual({
      status: "valid",
      redirectUrl: null,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ redirect: "manual", method: "HEAD" })
    );
  });

  it("reports a URL that does not answer", async () => {
    globalThis.fetch.mockRejectedValue(new Error("network"));

    await expect(fetchUrlStatus("https://example.com")).resolves.toEqual({
      status: "invalid",
      redirectUrl: null,
    });
  });
});

describe("what fetchUrlStatus refuses to ask about at all", () => {
  it("never fetches an internal host or an unsupported scheme", async () => {
    for (const url of [
      "http://127.0.0.1:8080/admin",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost/",
      "javascript:alert(1)",
      "file:///etc/passwd",
    ]) {
      await expect(fetchUrlStatus(url)).resolves.toEqual({
        status: "invalid",
        redirectUrl: null,
      });
    }

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("says nothing about an empty URL", async () => {
    await expect(fetchUrlStatus("")).resolves.toEqual({ status: "idle", redirectUrl: null });
  });
});
