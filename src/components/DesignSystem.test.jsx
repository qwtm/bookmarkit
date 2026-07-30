import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StarRating } from "./DesignSystem.jsx";

const stars = () => screen.getAllByRole("radio");

describe("StarRating radiogroup (#24)", () => {
  it("exposes a single tab stop, on the selected star", () => {
    render(<StarRating value={3} onChange={vi.fn()} />);
    expect(stars().map((star) => star.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  });

  it("puts the tab stop on the first star when nothing is rated", () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    expect(stars().map((star) => star.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("checks exactly one radio even though the fill is cumulative", () => {
    render(<StarRating value={3} onChange={vi.fn()} />);
    expect(stars().map((star) => star.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
      "false",
      "false",
    ]);
  });

  it("raises the rating with ArrowRight and lowers it with ArrowLeft", () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);

    fireEvent.keyDown(stars()[2], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(4);

    fireEvent.keyDown(stars()[2], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("clears the rating when arrowing left off the first star", () => {
    const onChange = vi.fn();
    render(<StarRating value={1} onChange={onChange} />);

    fireEvent.keyDown(stars()[0], { key: "ArrowLeft" });

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("stops at five stars", () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} />);

    fireEvent.keyDown(stars()[4], { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("moves focus to the newly selected star", () => {
    render(<StarRating value={2} onChange={vi.fn()} />);

    fireEvent.keyDown(stars()[1], { key: "ArrowRight" });

    expect(document.activeElement).toBe(stars()[2]);
  });

  it("keeps focus on the first star after clearing", () => {
    render(<StarRating value={1} onChange={vi.fn()} />);

    fireEvent.keyDown(stars()[0], { key: "ArrowLeft" });

    expect(document.activeElement).toBe(stars()[0]);
  });

  it("clears the rating when the selected star is activated", () => {
    const onChange = vi.fn();
    render(<StarRating value={4} onChange={onChange} />);

    fireEvent.click(stars()[3]);

    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe("StarRating toggle-button variant (#24)", () => {
  it("keeps every star reachable by Tab and ignores the arrow keys", () => {
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} buttonSemantics />);
    const buttons = screen.getAllByRole("button");

    expect(buttons.map((button) => button.tabIndex)).toEqual([0, 0, 0, 0, 0]);

    fireEvent.keyDown(buttons[1], { key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
  });
});
