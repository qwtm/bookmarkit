import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import LinkSweepBar from "./LinkSweepBar.jsx";

const setup = (overrides = {}) => {
  const onStop = vi.fn();
  const onShowBroken = vi.fn();
  const props = {
    running: false,
    checked: 0,
    total: 0,
    brokenCount: 0,
    brokenOnly: false,
    onStop,
    onShowBroken,
    ...overrides,
  };
  const view = render(<LinkSweepBar {...props} />);
  return { ...view, onStop, onShowBroken };
};

describe("LinkSweepBar (#47)", () => {
  it("stays out of the way when there is nothing to report", () => {
    setup();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports progress while a sweep runs", () => {
    setup({ running: true, checked: 3, total: 40 });

    expect(screen.getByRole("status")).toHaveTextContent("Checking links… 3 of 40");
  });

  it("offers to stop a running sweep", () => {
    const { onStop } = setup({ running: true, checked: 1, total: 10 });

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(onStop).toHaveBeenCalled();
  });

  it("reports what a finished sweep found, and offers to show it", () => {
    const { onShowBroken } = setup({ brokenCount: 2 });

    expect(screen.getByRole("status")).toHaveTextContent("2 links could not be reached.");
    fireEvent.click(screen.getByRole("button", { name: "Show them" }));

    expect(onShowBroken).toHaveBeenCalled();
  });

  it("counts one broken link in the singular", () => {
    setup({ brokenCount: 1 });

    expect(screen.getByRole("status")).toHaveTextContent("1 link could not be reached.");
  });

  it("drops the shortcut once the filter it sets is already on", () => {
    setup({ brokenCount: 2, brokenOnly: true });

    expect(screen.queryByRole("button", { name: "Show them" })).not.toBeInTheDocument();
  });
});
