import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ChangeReviewModal from "./ChangeReviewModal.jsx";

const rows = [
  {
    id: "1",
    title: "Rust ownership",
    fields: ["tags", "folderId"],
    before: { tags: ["rust"], folderId: "" },
    after: { tags: ["rust", "memory"], folderId: "Programming/Rust" },
  },
  {
    id: "2",
    title: "Sourdough starter",
    fields: ["description"],
    before: { description: "" },
    after: { description: "Keeping a starter alive." },
  },
];

const setup = (over = {}) => {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(<ChangeReviewModal rows={rows} onApply={onApply} onCancel={onCancel} {...over} />);
  return { onApply, onCancel };
};

describe("ChangeReviewModal (#44)", () => {
  it("shows what would change, before and after", () => {
    setup();

    expect(screen.getByText("Rust ownership")).toBeInTheDocument();
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.getByText("Programming/Rust")).toBeInTheDocument();
    expect(screen.getByText("Keeping a starter alive.")).toBeInTheDocument();
  });

  it("starts with everything accepted, so agreeing is one click", () => {
    const { onApply } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Apply 2 changes/ }));

    expect(onApply).toHaveBeenCalledWith(["1", "2"]);
  });

  it("applies only the rows still ticked", () => {
    const { onApply } = setup();

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 change$/ }));

    expect(onApply).toHaveBeenCalledWith(["2"]);
  });

  it("has nothing to apply once every row is dropped", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: /Deselect all/ }));

    expect(screen.getByRole("button", { name: /Apply 0 changes/ })).toBeDisabled();
  });

  it("takes everything back after a deselect all", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: /Deselect all/ }));
    fireEvent.click(screen.getByRole("button", { name: /Select all/ }));

    expect(screen.getByRole("button", { name: /Apply 2 changes/ })).toBeEnabled();
  });

  it("cannot be closed or changed mid-apply", () => {
    const { onCancel } = setup({ isApplying: true });

    expect(screen.getByRole("button", { name: /Cancel/ })).toBeDisabled();
    expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
