import React, { useMemo, useState } from "react";
import { generateNetscapeHtml, parseNetscapeHtml } from "../utils/netscapeBookmarks.js";
import { readImportedBookmarks } from "../utils/importedBookmarks.js";
import { Button, Tabs, Textarea } from "./DesignSystem.jsx";

/**
 * #25: Read the chosen file and clear the input. Without the reset the browser
 * fires no change event when the same file is picked again, so a failed import
 * could not be retried without picking a different file first.
 * @returns {Promise<string|null>} the file's text, or null if nothing was chosen
 */
const readChosenFile = (event) =>
  new Promise((resolve, reject) => {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsText(file);
  });

// How many entries an import will actually add, and what it had to leave behind.
const describeRejected = (rejectedCount) =>
  rejectedCount > 0
    ? ` Skipping ${rejectedCount} entr${rejectedCount === 1 ? "y" : "ies"} without a usable http(s) URL.`
    : "";

// UX-03: Memoize JSON/HTML export strings and data URIs to prevent recomputing on every render.
// UX-04: Add confirmation step before import with append vs replace option.

const ImportExportContent = ({ bookmarks, onClose, onImportJson, onImportHtml, showMessage }) => {
  const [activeTab, setActiveTab] = useState("export");
  const [importJsonText, setImportJsonText] = useState("");
  const [importHtmlText, setImportHtmlText] = useState("");
  // UX-03: Loading state for async JSON parse
  const [isParsing, setIsParsing] = useState(false);
  // UX-04: Confirmation state before executing import
  const [pendingImport, setPendingImport] = useState(null); // { type: 'json'|'html', data: any, count: number }
  const [replaceAll, setReplaceAll] = useState(false);

  // UX-03: Memoize expensive serializations so they run at most once per bookmarks change
  const jsonExport = useMemo(() => JSON.stringify(bookmarks, null, 2), [bookmarks]);

  const htmlExport = useMemo(() => generateNetscapeHtml(bookmarks), [bookmarks]);
  // UX-03: Memoize data URIs for download links
  const jsonDataUri = useMemo(
    () => `data:application/json;charset=utf-8,${encodeURIComponent(jsonExport)}`,
    [jsonExport]
  );
  const htmlDataUri = useMemo(
    () => `data:text/html;charset=utf-8,${encodeURIComponent(htmlExport)}`,
    [htmlExport]
  );

  /**
   * #25: Validate before confirming, not after. The array's raw length used to be
   * the number shown, so an import of 100 entries where 40 had no usable URL
   * still promised 100 bookmarks and then quietly added 60.
   */
  const stageJsonImport = (text) => {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      showMessage("Invalid JSON format. Expected an array of bookmarks.", "error");
      return;
    }
    const { bookmarks: importable, rejectedCount } = readImportedBookmarks(parsed);
    if (importable.length === 0) {
      showMessage(
        `No bookmarks to import.${describeRejected(rejectedCount) || " The array was empty."}`,
        "error"
      );
      return;
    }
    if (rejectedCount > 0) showMessage(describeRejected(rejectedCount).trim(), "info");
    setPendingImport({ type: "json", data: importable, count: importable.length });
  };

  // UX-04: Show confirmation instead of immediately importing
  const requestJsonImport = () => {
    // UX-03: Wrap JSON.parse in setTimeout to yield to the event loop for large payloads
    setIsParsing(true);
    setTimeout(() => {
      try {
        stageJsonImport(importJsonText);
      } catch {
        showMessage("Error parsing JSON. Please ensure it is valid JSON.", "error");
      } finally {
        setIsParsing(false);
      }
    }, 0);
  };

  const requestHtmlImport = () => {
    // Counted by parsing rather than by matching <DT>, which also introduces folders.
    setPendingImport({
      type: "html",
      data: importHtmlText,
      count: parseNetscapeHtml(importHtmlText).length,
    });
  };

  // UX-04: Execute confirmed import
  const executeImport = async () => {
    if (!pendingImport) return;
    try {
      if (pendingImport.type === "json") {
        if (replaceAll) {
          // Replace all existing bookmarks
          await onImportJson(pendingImport.data, true);
        } else {
          await onImportJson(pendingImport.data, false);
        }
      } else {
        // HTML import — await so status is only shown after completion
        await onImportHtml(pendingImport.data, replaceAll);
      }
    } catch {
      showMessage("Import failed. Please check the file format and try again.", "error");
    } finally {
      setPendingImport(null);
      setReplaceAll(false);
    }
  };

  const cancelImport = () => {
    setPendingImport(null);
    setReplaceAll(false);
  };

  return (
    <div>
      {/* UX-04: Confirmation step shown instead of the normal tabs UI */}
      {pendingImport ? (
        <div className="space-y-4">
          <p className="text-primary-text">
            This will add <strong>{pendingImport.count}</strong> bookmark
            {pendingImport.count !== 1 ? "s" : ""} to your collection.
          </p>
          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                checked={!replaceAll}
                onChange={() => setReplaceAll(false)}
                className="accent-accent"
              />
              <span className="text-primary-text text-sm">Append to existing bookmarks</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                checked={replaceAll}
                onChange={() => setReplaceAll(true)}
                className="accent-accent"
              />
              <span className="text-primary-text text-sm">Replace all existing bookmarks</span>
            </label>
          </div>
          <div className="flex space-x-3">
            <Button onClick={executeImport}>Import</Button>
            <Button intent="secondary" onClick={cancelImport}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <Tabs
              active={activeTab}
              onChange={setActiveTab}
              tabs={[
                { value: "export", label: "Export" },
                { value: "import-json", label: "Import JSON" },
                { value: "import-html", label: "Import HTML" },
              ]}
            />
          </div>

          {activeTab === "export" && (
            <div className="space-y-4">
              <p className="text-secondary-text">
                Export your bookmarks as JSON or Netscape HTML format.
              </p>
              <div>
                <Textarea
                  label="JSON Export"
                  id="export-json"
                  readOnly
                  value={jsonExport}
                  mono
                  rows={8}
                />
                <a
                  href={jsonDataUri}
                  download="bookmarks.json"
                  className="ds-button ds-button--primary ds-button--md mt-2"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download JSON
                </a>
              </div>
              <div>
                <Textarea
                  label="HTML Export (Netscape Bookmark File)"
                  id="export-html"
                  readOnly
                  value={htmlExport}
                  mono
                  rows={8}
                />
                <a
                  href={htmlDataUri}
                  download="bookmarks.html"
                  className="ds-button ds-button--primary ds-button--md mt-2"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download HTML
                </a>
              </div>
            </div>
          )}

          {activeTab === "import-json" && (
            <div className="space-y-4">
              <p className="text-secondary-text">
                Paste your JSON bookmarks here or upload a file.
              </p>
              <label
                htmlFor="upload-json-file"
                className="block text-sm font-medium text-primary-text mb-2"
              >
                Upload JSON File
              </label>
              <input
                id="upload-json-file"
                type="file"
                accept=".json"
                onChange={async (e) => {
                  try {
                    const text = await readChosenFile(e);
                    if (text !== null) stageJsonImport(text);
                  } catch {
                    showMessage(
                      "Error parsing JSON file. Please ensure it is valid JSON.",
                      "error"
                    );
                  }
                }}
                className="block w-full text-sm text-secondary-text file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary-bg file:text-accent hover:file:bg-primary-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              />
              <div className="my-4 text-center text-sm text-secondary-text">— OR —</div>
              <Textarea
                label="Paste JSON Data"
                id="import-json-text"
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                rows={8}
                mono
                placeholder='[{"title": "Example", "url": "https://example.com", "tags": ["test"]}]'
              />
              <Button
                onClick={requestJsonImport}
                disabled={isParsing || !importJsonText.trim()}
                loading={isParsing}
              >
                {isParsing ? "Parsing…" : "Import JSON Data"}
              </Button>
            </div>
          )}

          {activeTab === "import-html" && (
            <div className="space-y-4">
              <p className="text-secondary-text">
                Upload an HTML bookmark file or paste its content.
              </p>
              <label
                htmlFor="upload-html-file"
                className="block text-sm font-medium text-primary-text mb-2"
              >
                Upload HTML File (Browser Export)
              </label>
              <input
                id="upload-html-file"
                type="file"
                accept=".html,.htm"
                onChange={async (e) => {
                  try {
                    const text = await readChosenFile(e);
                    if (text === null) return;
                    // #40: what the reader will actually find, rather than a count
                    // of <DT> rows — a folder is a <DT> too.
                    setPendingImport({
                      type: "html",
                      data: text,
                      count: parseNetscapeHtml(text).length,
                    });
                  } catch {
                    showMessage("The HTML file could not be read. Please try again.", "error");
                  }
                }}
                className="block w-full text-sm text-secondary-text file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary-bg file:text-accent hover:file:bg-primary-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              />
              <div className="my-4 text-center text-sm text-secondary-text">— OR —</div>
              <Textarea
                label="Paste HTML Data"
                id="import-html-text"
                value={importHtmlText}
                onChange={(e) => setImportHtmlText(e.target.value)}
                rows={8}
                mono
                placeholder="<!DOCTYPE NETSCAPE-Bookmark-file-1>..."
              />
              <Button onClick={requestHtmlImport} disabled={!importHtmlText.trim()}>
                Import HTML Data
              </Button>
            </div>
          )}
        </>
      )}

      <div className="flex justify-end mt-6">
        <Button type="button" intent="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
};

export default ImportExportContent;
