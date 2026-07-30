import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SmartViewBar from "./SmartViewBar.jsx";

const views = [
  { id: "v1", name: "Unread ML papers", plan: [], filters: {} },
  { id: "v2", name: "Five stars", plan: [], filters: {} },
];

const setup = (props = {}) => {
  const onApply = vi.fn();
  const onSave = vi.fn().mockReturnValue(true);
  const onForget = vi.fn();
  render(
    <SmartViewBar
      views={props.views ?? views}
      activeViewId={props.activeViewId ?? null}
      canSave={props.canSave ?? true}
      onApply={onApply}
      onSave={onSave}
      onForget={onForget}
      {...props}
    />
  );
  return { onApply, onSave, onForget };
};

describe("SmartViewBar (#49)", () => {
  it("restores a saved view when its chip is pressed", () => {
    const { onApply } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Unread ML papers" }));

    expect(onApply).toHaveBeenCalledWith(views[0]);
  });

  it("marks the view the screen is showing", () => {
    setup({ activeViewId: "v2" });

    expect(screen.getByRole("button", { name: "Five stars" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Unread ML papers" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("forgets a view", () => {
    const { onForget } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Delete view Five stars" }));

    expect(onForget).toHaveBeenCalledWith("v2");
  });

  it("saves the current view under a name", () => {
    const { onSave } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
    fireEvent.change(screen.getByLabelText("Name for the saved view"), {
      target: { value: "Reading later" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("Reading later");
  });

  it("will not save an unnamed view", () => {
    const { onSave } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
    fireEvent.change(screen.getByLabelText("Name for the saved view"), {
      target: { value: "  " },
    });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  // The app decides whether there was anything to save, so a refusal has to leave
  // the name where it was rather than closing over it.
  it("keeps the form open when the app refuses to save", () => {
    const onSave = vi.fn().mockReturnValue(false);
    setup({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
    fireEvent.change(screen.getByLabelText("Name for the saved view"), {
      target: { value: "Nothing here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByLabelText("Name for the saved view")).toHaveValue("Nothing here");
  });

  it("offers no way to save when there is nothing on screen to save", () => {
    setup({ canSave: false });

    expect(screen.queryByRole("button", { name: "Save current view" })).not.toBeInTheDocument();
  });

  it("stays out of the way entirely when there is nothing to show or save", () => {
    setup({ views: [], canSave: false });

    expect(screen.queryByRole("group", { name: "Saved views" })).not.toBeInTheDocument();
  });

  it("gives up naming without saving", () => {
    const { onSave } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save current view" })).toBeInTheDocument();
  });
});
