import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FolderTree, { DRAG_BOOKMARKS, DRAG_FOLDER } from "./FolderTree.jsx";
import { UNFILED } from "../utils/folderTree.js";

const at = (id, folderId) => ({ id, title: `Bookmark ${id}`, url: `https://${id}.test`, folderId });

const bookmarks = [at("1", "Work"), at("2", "Work/Project A"), at("3", "Personal"), at("4", "")];

const setup = (props = {}) => {
  const handlers = {
    onSelect: vi.fn(),
    onMoveBookmarks: vi.fn(),
    onMoveFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
  };
  render(<FolderTree bookmarks={bookmarks} {...handlers} {...props} />);
  return handlers;
};

/** A drop carrying one kind of payload, since jsdom has no real DataTransfer. */
const carrying = (type, value) => ({
  dataTransfer: { getData: (asked) => (asked === type ? value : "") },
});

describe("FolderTree (#55)", () => {
  it("shows the folders the bookmarks imply, nested", () => {
    setup();

    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personal" })).toBeInTheDocument();
  });

  it("counts what is under a folder, not only what is directly in it", () => {
    setup();

    // Work holds one bookmark and one in a subfolder.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // all bookmarks
  });

  it("offers the bookmarks in no folder as somewhere to stand", () => {
    const { onSelect } = setup();

    fireEvent.click(screen.getByRole("button", { name: "No folder" }));

    expect(onSelect).toHaveBeenCalledWith(UNFILED);
  });

  it("filters by a folder, and clicking the active one clears it", () => {
    const { onSelect } = setup({ activeFolder: "Work" });

    fireEvent.click(screen.getByRole("button", { name: "Work" }));

    expect(onSelect).toHaveBeenCalledWith("");
  });

  it("collapses a folder without hiding itself", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Work" }));

    expect(screen.queryByRole("button", { name: "Project A" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
  });

  it("moves dropped bookmarks into the folder they landed on", () => {
    const { onMoveBookmarks } = setup();

    fireEvent.drop(
      screen.getByRole("button", { name: "Personal" }).parentElement,
      carrying(DRAG_BOOKMARKS, JSON.stringify(["1", "2"]))
    );

    expect(onMoveBookmarks).toHaveBeenCalledWith(["1", "2"], "Personal");
  });

  it("moves bookmarks out of every folder when dropped on all bookmarks", () => {
    const { onMoveBookmarks } = setup();

    fireEvent.drop(
      screen.getByRole("button", { name: "All bookmarks" }).parentElement,
      carrying(DRAG_BOOKMARKS, JSON.stringify(["1"]))
    );

    expect(onMoveBookmarks).toHaveBeenCalledWith(["1"], UNFILED);
  });

  it("renests a dropped folder under the one it landed on", () => {
    const { onMoveFolder } = setup();

    fireEvent.drop(
      screen.getByRole("button", { name: "Personal" }).parentElement,
      carrying(DRAG_FOLDER, "Work")
    );

    expect(onMoveFolder).toHaveBeenCalledWith("Work", "Personal/Work");
  });

  it("ignores a drop carrying something it does not understand", () => {
    const { onMoveBookmarks, onMoveFolder } = setup();

    fireEvent.drop(
      screen.getByRole("button", { name: "Personal" }).parentElement,
      carrying("text/plain", "hello")
    );

    expect(onMoveBookmarks).not.toHaveBeenCalled();
    expect(onMoveFolder).not.toHaveBeenCalled();
  });

  it("renames in place, reporting the whole path", () => {
    const { onRenameFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Rename Work/Project A" }));
    const field = screen.getByLabelText("Rename Work/Project A");
    fireEvent.change(field, { target: { value: "Project B" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(onRenameFolder).toHaveBeenCalledWith("Work/Project A", "Work/Project B");
  });

  it("abandons a rename on Escape", () => {
    const { onRenameFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Rename Personal" }));
    const field = screen.getByLabelText("Rename Personal");
    fireEvent.change(field, { target: { value: "Home" } });
    fireEvent.keyDown(field, { key: "Escape" });

    expect(onRenameFolder).not.toHaveBeenCalled();
  });

  it("says where the bookmarks go before removing a folder", () => {
    const { onDeleteFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Remove folder Work/Project A" }));
    expect(screen.getByText(/Move 1 bookmark to Work/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDeleteFolder).toHaveBeenCalledWith("Work/Project A");
  });

  it("removes nothing when the offer is declined", () => {
    const { onDeleteFolder } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Remove folder Personal" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(onDeleteFolder).not.toHaveBeenCalled();
  });
});
