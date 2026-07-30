import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BulkEditBar from "./BulkEditBar.jsx";

const selection = (count, overrides = {}) =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    title: `Bookmark ${i + 1}`,
    tags: [],
    folderId: "",
    rating: 0,
    ...overrides,
  }));

const setup = (props = {}) => {
  const onApply = vi.fn().mockResolvedValue(undefined);
  const onClearSelection = vi.fn();
  render(
    <BulkEditBar
      selected={props.selected || selection(3)}
      allBookmarks={props.allBookmarks || props.selected || selection(3)}
      onApply={onApply}
      onClearSelection={onClearSelection}
      {...props}
    />
  );
  return { onApply, onClearSelection };
};

const addTags = () => screen.getByLabelText("Tags to add, comma separated");
const removeTags = () => screen.getByLabelText("Tags to remove, comma separated");
const folder = () => screen.getByLabelText("Folder to move the selection into");
const rating = () => screen.getByLabelText("Rating to set");
const applyButton = () => screen.getByRole("button", { name: /^Apply/ });

describe("BulkEditBar (#54)", () => {
  it("says how many bookmarks it is about to act on", () => {
    setup({ selected: selection(4) });

    expect(screen.getByText("4 selected")).toBeInTheDocument();
  });

  it("will not apply an empty change", () => {
    setup();

    expect(applyButton()).toBeDisabled();
  });

  it("sends only the bookmarks a change would alter", async () => {
    const { onApply } = setup({
      selected: [
        { id: "1", tags: ["react"] },
        { id: "2", tags: [] },
      ],
    });

    fireEvent.change(addTags(), { target: { value: "react" } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ id: "2", tags: ["react"] }]));
  });

  it("adds and removes tags in one apply", async () => {
    const { onApply } = setup({ selected: [{ id: "1", tags: ["old"] }] });

    fireEvent.change(addTags(), { target: { value: "new" } });
    fireEvent.change(removeTags(), { target: { value: "old" } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ id: "1", tags: ["new"] }]));
  });

  it("says nothing will change when the selection already matches", () => {
    setup({ selected: [{ id: "1", tags: ["react"] }] });

    fireEvent.change(addTags(), { target: { value: "react" } });

    expect(screen.getByText(/Nothing to change/)).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
  });

  it("describes the change and how many are already there", () => {
    setup({
      selected: [
        { id: "1", tags: ["react"] },
        { id: "2", tags: [] },
      ],
    });

    fireEvent.change(addTags(), { target: { value: "react" } });

    expect(screen.getByText(/add react — 1 bookmark/)).toBeInTheDocument();
    expect(screen.getByText(/1 already match/)).toBeInTheDocument();
  });

  it("offers the folders already in use, plus leaving and clearing them", () => {
    setup({
      selected: selection(1),
      allBookmarks: [
        { id: "1", folderId: "work" },
        { id: "2", folderId: "reading" },
      ],
    });

    const labels = [...folder().options].map((o) => o.textContent);
    expect(labels).toEqual(["Keep folders", "No folder", "reading", "work", "New folder…"]);
  });

  it("moves a selection into a folder that does not exist yet", async () => {
    const { onApply } = setup({ selected: [{ id: "1", folderId: "" }] });

    fireEvent.change(folder(), { target: { value: "\u0000new" } });
    fireEvent.change(screen.getByLabelText("New folder path"), {
      target: { value: "Work/Reading" },
    });
    fireEvent.click(applyButton());

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith([{ id: "1", folderId: "Work/Reading" }])
    );
  });

  // "No folder" and "keep the folder alone" are different instructions, and an
  // empty text box cannot tell them apart — which is why the folder is a choice.
  it("moves a selection out of its folder", async () => {
    const { onApply } = setup({ selected: [{ id: "1", folderId: "work" }] });

    fireEvent.change(folder(), { target: { value: "\u0000root" } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ id: "1", folderId: "" }]));
  });

  it("sets and clears ratings", async () => {
    const { onApply } = setup({ selected: [{ id: "1", rating: 3 }] });

    fireEvent.change(rating(), { target: { value: "0" } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ id: "1", rating: 0 }]));
  });

  it("asks again before touching a large selection", async () => {
    const { onApply } = setup({ selected: selection(11) });

    fireEvent.change(addTags(), { target: { value: "bulk" } });
    fireEvent.click(applyButton());

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply to 11?" })).toBeInTheDocument();

    fireEvent.click(applyButton());
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  });

  it("applies a small selection on the first press", async () => {
    const { onApply } = setup({ selected: selection(10) });

    fireEvent.change(addTags(), { target: { value: "bulk" } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  });

  // Otherwise the count that was confirmed is not the count that gets written.
  it("withdraws a pending confirmation when the change is edited", () => {
    setup({ selected: selection(11) });

    fireEvent.change(addTags(), { target: { value: "bulk" } });
    fireEvent.click(applyButton());
    expect(screen.getByRole("button", { name: "Apply to 11?" })).toBeInTheDocument();

    fireEvent.change(addTags(), { target: { value: "bulk, more" } });

    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("empties the form once a change has been applied", async () => {
    setup({ selected: selection(2) });

    fireEvent.change(addTags(), { target: { value: "bulk" } });
    fireEvent.click(applyButton());

    await waitFor(() => expect(addTags()).toHaveValue(""));
  });

  it("hands deleting back to the app that owns the confirmation", () => {
    const onDelete = vi.fn();
    setup({ selected: selection(2), onDelete });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalled();
  });

  // Without this the document-level handler in useBookmarkSelection clears the
  // selection on mousedown, unmounting the bar before a control can be used.
  it("marks itself as part of acting on the selection", () => {
    setup({ selected: selection(2) });

    expect(screen.getByRole("group", { name: /Bulk edit/ })).toHaveAttribute(
      "data-keeps-selection"
    );
  });

  it("lets the selection go", () => {
    const { onClearSelection } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(onClearSelection).toHaveBeenCalled();
  });
});
