import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { usePageMetadata } from "./usePageMetadata.js";

const html = (title) => `<html><head><title>${title}</title></head><body>body</body></html>`;

const Probe = ({ url }) => {
  const { meta, loading } = usePageMetadata(url, { settleMs: 0 });
  return <span data-testid="title">{loading ? "loading" : (meta?.title ?? "none")}</span>;
};

const title = () => screen.getByTestId("title").textContent;

let sendMessage;

beforeEach(() => {
  sendMessage = vi.fn((message, respond) =>
    respond({ ok: true, html: html(`Page for ${message.url}`) })
  );
  globalThis.chrome = { runtime: { id: "test", sendMessage } };
});

afterEach(() => {
  delete globalThis.chrome;
});

describe("usePageMetadata (#48)", () => {
  it("reads what the page says about itself", async () => {
    render(<Probe url="https://example.com/p/8812" />);

    await waitFor(() => expect(title()).toBe("Page for https://example.com/p/8812"));
  });

  it("asks about a URL once, however often it comes back", async () => {
    const { rerender } = render(<Probe url="https://example.com/a" />);
    await waitFor(() => expect(title()).toContain("/a"));

    rerender(<Probe url="https://example.com/b" />);
    await waitFor(() => expect(title()).toContain("/b"));

    rerender(<Probe url="https://example.com/a" />);
    await waitFor(() => expect(title()).toContain("/a"));

    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not ask about a URL that is still half-typed", async () => {
    render(<Probe url="https:/" />);

    await waitFor(() => expect(title()).toBe("none"));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // The same gate the worker enforces: an internal host is not something to fetch,
  // and a javascript: URL is not something to fetch at all.
  it("never asks about an internal host or an unsupported scheme", async () => {
    const { rerender } = render(<Probe url="http://127.0.0.1:8080/admin" />);
    await waitFor(() => expect(title()).toBe("none"));

    rerender(<Probe url="javascript:alert(1)" />);
    await waitFor(() => expect(title()).toBe("none"));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("can be switched off entirely", async () => {
    const Off = () => {
      const { meta } = usePageMetadata("https://example.com", { enabled: false, settleMs: 0 });
      return <span data-testid="title">{meta?.title ?? "none"}</span>;
    };
    render(<Off />);

    await waitFor(() => expect(title()).toBe("none"));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("keeps quiet when the worker has nothing to offer", async () => {
    sendMessage.mockImplementation((_message, respond) => respond({ ok: false }));
    render(<Probe url="https://example.com" />);

    await waitFor(() => expect(title()).toBe("none"));
  });

  it("waits for the URL to settle before asking", async () => {
    vi.useFakeTimers();
    try {
      const Settling = () => {
        const { meta } = usePageMetadata("https://example.com", { settleMs: 500 });
        return <span data-testid="title">{meta?.title ?? "none"}</span>;
      };
      render(<Settling />);

      expect(sendMessage).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
