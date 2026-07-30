import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import BookmarkForm from "./BookmarkForm.jsx";

// The URL check is debounced by a second, so time is driven explicitly.
const URL_CHECK_DELAY = 1000;

const advancePastUrlCheck = async () => {
  await act(async () => {
    vi.advanceTimersByTime(URL_CHECK_DELAY);
  });
};

const renderForm = (props) =>
  render(
    <BookmarkForm
      bookmark={{ id: "1", title: "A", url: "https://a.test/" }}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />
  );

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BookmarkForm URL redirect follow (#28)", () => {
  it("rewrites the field to the redirect target", async () => {
    const fetchUrlStatus = vi
      .fn()
      .mockResolvedValue({ status: "valid", redirectUrl: "https://b.test/" });
    renderForm({ fetchUrlStatus });

    await advancePastUrlCheck();

    expect(screen.getByLabelText("URL")).toHaveValue("https://b.test/");
  });

  it("stops instead of bouncing between two URLs that redirect to each other", async () => {
    const fetchUrlStatus = vi.fn(async (url) => ({
      status: "valid",
      redirectUrl: url === "https://a.test/" ? "https://b.test/" : "https://a.test/",
    }));
    renderForm({ fetchUrlStatus });

    // Three windows is more than enough for a loop to show itself.
    await advancePastUrlCheck();
    await advancePastUrlCheck();
    await advancePastUrlCheck();

    expect(screen.getByLabelText("URL")).toHaveValue("https://b.test/");
    expect(fetchUrlStatus.mock.calls.map(([url]) => url)).toEqual([
      "https://a.test/",
      "https://b.test/",
    ]);
  });

  it("leaves the field alone when it already holds the redirect target", async () => {
    const fetchUrlStatus = vi
      .fn()
      .mockResolvedValue({ status: "valid", redirectUrl: "https://a.test/" });
    renderForm({ fetchUrlStatus });

    await advancePastUrlCheck();
    await advancePastUrlCheck();

    expect(screen.getByLabelText("URL")).toHaveValue("https://a.test/");
    expect(fetchUrlStatus).toHaveBeenCalledTimes(1);
  });
});
