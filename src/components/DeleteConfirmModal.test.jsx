import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

const setup = (overrides = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteConfirmModal
      message="Are you sure you want to delete 2 bookmark(s)?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
};

const reasons = [
  {
    id: "syndicated",
    title: "Rust ownership, explained",
    keptTitle: "Rust ownership explained",
    reason: "syndicated copy of the same article",
  },
];

describe("DeleteConfirmModal", () => {
  it("asks before deleting, and reports which way the user went", () => {
    const { onConfirm, onCancel } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  // #86: a proposal the user did not make by hand has to explain itself.
  it("shows why each proposed pair was called the same page", () => {
    setup({ reasons });

    expect(screen.getByText("Rust ownership, explained")).toBeInTheDocument();
    expect(screen.getByText("Rust ownership explained")).toBeInTheDocument();
    expect(screen.getByText("syndicated copy of the same article")).toBeInTheDocument();
  });

  it("stays plain for a deletion that needs no explaining", () => {
    setup();

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("cannot be abandoned half way through a deletion", () => {
    const { onCancel } = setup({ isLoading: true });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
