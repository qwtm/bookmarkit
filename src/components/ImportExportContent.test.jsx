import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImportExportContent from "./ImportExportContent.jsx";

const setup = () => {
  const showMessage = vi.fn();
  const onImportJson = vi.fn().mockResolvedValue(undefined);
  render(
    <ImportExportContent
      bookmarks={[]}
      onClose={() => {}}
      onImportJson={onImportJson}
      onImportHtml={() => {}}
      showMessage={showMessage}
    />
  );
  return { showMessage, onImportJson };
};

const chooseJsonFile = (contents) => {
  fireEvent.click(screen.getByRole("tab", { name: "Import JSON" }));
  const input = screen.getByLabelText("Upload JSON File");
  const file = new File([contents], "bookmarks.json", { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
  return input;
};

describe("ImportExportContent file upload (#25)", () => {
  it("clears the input so the same file can be picked again after a failure", async () => {
    const { showMessage } = setup();
    const input = chooseJsonFile("{ not json");

    await waitFor(() => expect(showMessage).toHaveBeenCalled());
    // A file input with no value has no selection, which is what makes the
    // browser fire change again for the same file.
    expect(input.value).toBe("");
  });

  it("counts only the entries it can actually import", async () => {
    setup();
    chooseJsonFile(
      JSON.stringify([
        { title: "Keep", url: "https://example.com/one" },
        { title: "No URL" },
        { title: "Unsafe", url: "javascript:alert(1)" },
        { title: "Keep too", url: "https://example.com/two" },
      ])
    );

    const confirmation = await screen.findByText(/bookmarks to your collection/);
    expect(confirmation).toHaveTextContent("This will add 2 bookmarks");
  });

  it("hands the store the normalized entries, not the raw file", async () => {
    const { onImportJson } = setup();
    chooseJsonFile(JSON.stringify([{ id: "from-file", url: "https://example.com/", rating: "4" }]));

    fireEvent.click(await screen.findByRole("button", { name: "Import" }));

    await waitFor(() => expect(onImportJson).toHaveBeenCalled());
    const [imported] = onImportJson.mock.calls[0];
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ url: "https://example.com/", rating: 4 });
    expect(imported[0]).not.toHaveProperty("id");
  });

  it("refuses a file with nothing importable instead of confirming an empty import", async () => {
    const { showMessage } = setup();
    chooseJsonFile(JSON.stringify([{ title: "No URL" }]));

    await waitFor(() =>
      expect(showMessage).toHaveBeenCalledWith(expect.stringContaining("No bookmarks"), "error")
    );
    expect(screen.queryByText(/to your collection/)).toBeNull();
  });

  it("rejects JSON that is not an array of bookmarks", async () => {
    const { showMessage } = setup();
    chooseJsonFile(JSON.stringify({ bookmarks: [] }));

    await waitFor(() =>
      expect(showMessage).toHaveBeenCalledWith(
        expect.stringContaining("Expected an array"),
        "error"
      )
    );
  });
});
