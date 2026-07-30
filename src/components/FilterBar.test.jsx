import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterBar from "./FilterBar.jsx";
import { EMPTY_FILTERS, cycleTag } from "../utils/manualFilters.js";

const tagFacets = [
  { tag: "docs", count: 2 },
  { tag: "react", count: 1 },
];

function setup(overrides = {}) {
  const onChange = vi.fn();
  const onCycleTag = vi.fn();
  const onClear = vi.fn();
  const props = {
    filters: EMPTY_FILTERS,
    tagFacets,
    onChange,
    onCycleTag,
    onClear,
    ...overrides,
  };
  render(<FilterBar {...props} />);
  return { onChange, onCycleTag, onClear };
}

describe("FilterBar (#53)", () => {
  it("reports text changes without waiting for a submit", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Filter bookmarks by text"), {
      target: { value: "react" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, text: "react" });
  });

  it("renders a chip per tag with its count", () => {
    setup();
    expect(screen.getByRole("button", { name: /Tag docs, 2 bookmarks/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tag react, 1 bookmark,/ })).toBeInTheDocument();
  });

  it("cycles a tag when its chip is clicked", () => {
    const { onCycleTag } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Tag docs/ }));
    expect(onCycleTag).toHaveBeenCalledWith("docs");
  });

  it("announces the include/exclude state of a chip to screen readers", () => {
    const included = cycleTag(EMPTY_FILTERS, "docs");
    const { unmount } = render(
      <FilterBar
        filters={included}
        tagFacets={tagFacets}
        onChange={() => {}}
        onCycleTag={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /Tag docs.*including/ })).toBeInTheDocument();
    unmount();

    const excluded = cycleTag(included, "docs");
    render(
      <FilterBar
        filters={excluded}
        tagFacets={tagFacets}
        onChange={() => {}}
        onCycleTag={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /Tag docs.*excluding/ })).toBeInTheDocument();
  });

  it("changes rating and sort", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Minimum rating"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, minRating: 3 });

    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "title" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, sortBy: "title" });
  });

  // #47: the sweep writes urlStatus; this is how the result is looked at without
  // asking an LLM anything.
  it("toggles the broken-only filter and reports its state", () => {
    const { onChange } = setup();
    const toggle = screen.getByRole("button", { name: "Broken only" });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, brokenOnly: true });
  });

  it("shows the broken-only filter as pressed while it is on", () => {
    setup({ filters: { ...EMPTY_FILTERS, brokenOnly: true } });

    expect(screen.getByRole("button", { name: "Broken only" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("disables the direction toggle until a sort field is chosen", () => {
    setup();
    expect(screen.getByRole("button", { name: /Sort direction/ })).toBeDisabled();
  });

  it("flips sort direction once a field is chosen", () => {
    const { onChange } = setup({ filters: { ...EMPTY_FILTERS, sortBy: "title" } });
    fireEvent.click(screen.getByRole("button", { name: /Sort direction/ }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, sortBy: "title", order: "desc" });
  });

  it("only offers Clear filters when something is active", () => {
    const { unmount } = render(
      <FilterBar
        filters={EMPTY_FILTERS}
        tagFacets={tagFacets}
        onChange={() => {}}
        onCycleTag={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    unmount();

    const onClear = vi.fn();
    render(
      <FilterBar
        filters={{ ...EMPTY_FILTERS, minRating: 2 }}
        tagFacets={tagFacets}
        onChange={() => {}}
        onCycleTag={() => {}}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("collapses a long tag list behind a 'more' toggle", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ tag: `t${i}`, count: 1 }));
    setup({ tagFacets: many });
    // 12 visible + the "+8 more" button
    expect(screen.getByRole("button", { name: "+8 more" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tag t15/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+8 more" }));
    expect(screen.getByRole("button", { name: /Tag t15/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });

  it("renders no chip row when nothing is tagged", () => {
    setup({ tagFacets: [] });
    expect(screen.queryByRole("button", { name: /^Tag / })).not.toBeInTheDocument();
  });
});
