import React, { useState } from "react";

const ImportExportContent = ({
  bookmarks,
  onClose,
  onImportJson,
  onImportHtml,
  showMessage,
}) => {
  const [activeTab, setActiveTab] = useState("export");
  const [importJsonText, setImportJsonText] = useState("");
  const [importHtmlText, setImportHtmlText] = useState("");

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (Array.isArray(parsed)) {
        onImportJson(parsed);
        showMessage("Bookmarks imported successfully from JSON!", "success");
      } else {
        showMessage(
          "Invalid JSON format. Expected an array of bookmarks.",
          "error",
        );
      }
    } catch (error) {
      console.error("JSON parsing error:", error);
      showMessage(
        "Error parsing JSON. Please ensure it is valid JSON.",
        "error",
      );
    }
  };

  const handleHtmlImport = () => {
    onImportHtml(importHtmlText);
    showMessage("Bookmarks imported successfully from HTML!", "success");
  };

  const generateHtmlExport = () => {
    let html = "<!DOCTYPE NETSCAPE-Bookmark-file-1>\n";
    html += "<!-- This is an automatically generated file. -->\n";
    html += "<!-- DO NOT EDIT! -->\n";
    html +=
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n';
    html += "<TITLE>Bookmarks</TITLE>\n";
    html += "<H1>Bookmarks</H1>\n";
    html += "<DL><p>\n";

    bookmarks.forEach((b) => {
      const addDate = b.createdAt
        ? Math.floor(new Date(b.createdAt).getTime() / 1000)
        : "";
      const lastModified = b.updatedAt
        ? Math.floor(new Date(b.updatedAt).getTime() / 1000)
        : "";
      const icon = b.faviconUrl ? ` ICON="${b.faviconUrl}"` : "";
      const description = b.description
        ? ` DESCRIPTION="${b.description}"`
        : "";
      html += `    <DT><A HREF="${b.url}" ADD_DATE="${addDate}" LAST_MODIFIED="${lastModified}"${icon}${description}>${b.title}</A>\n`;
    });

    html += "</DL><p>\n";
    return html;
  };

  return (
    <div className="p-6 bg-primary-bg rounded-lg">
      <h2 className="text-2xl font-semibold mb-6 text-primary-text">
        Import / Export Bookmarks
      </h2>

      <div className="flex border-b border-border mb-4">
        <button
          className={`py-2 px-4 text-sm font-medium ${activeTab === "export" ? "border-b-2 border-accent text-accent" : "text-secondary-text hover:text-primary-text"}`}
          onClick={() => setActiveTab("export")}
        >
          Export
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium ${activeTab === "import-json" ? "border-b-2 border-accent text-accent" : "text-secondary-text hover:text-primary-text"}`}
          onClick={() => setActiveTab("import-json")}
        >
          Import JSON
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium ${activeTab === "import-html" ? "border-b-2 border-accent text-accent" : "text-secondary-text hover:text-primary-text"}`}
          onClick={() => setActiveTab("import-html")}
        >
          Import HTML
        </button>
      </div>

      {activeTab === "export" && (
        <div className="space-y-4">
          <p className="text-secondary-text">
            Export your bookmarks as JSON or Netscape HTML format.
          </p>
          <div>
            <label
              htmlFor="export-json"
              className="block text-sm font-medium text-primary-text mb-1"
            >
              JSON Export
            </label>
            <textarea
              id="export-json"
              readOnly
              value={JSON.stringify(bookmarks, null, 2)}
              className="w-full h-48 px-3 py-2 border border-border rounded-md bg-secondary-bg text-primary-text font-mono text-sm resize-y"
            ></textarea>
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(bookmarks, null, 2))}`}
              download="bookmarks.json"
              className="inline-flex items-center px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors"
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
            <label
              htmlFor="export-html"
              className="block text-sm font-medium text-primary-text mb-1"
            >
              HTML Export (Netscape Bookmark File)
            </label>
            <textarea
              id="export-html"
              readOnly
              value={generateHtmlExport()}
              className="w-full h-48 px-3 py-2 border border-border rounded-md bg-secondary-bg text-primary-text font-mono text-sm resize-y"
            ></textarea>
            <a
              href={`data:text/html;charset=utf-8,${encodeURIComponent(generateHtmlExport())}`}
              download="bookmarks.html"
              className="inline-flex items-center px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors"
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
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                  try {
                    const importedData = JSON.parse(event.target.result);
                    if (Array.isArray(importedData)) {
                      onImportJson(importedData);
                    } else {
                      showMessage(
                        "Invalid JSON format in file. Expected an array of bookmarks.",
                        "error",
                      );
                    }
                  } catch (error) {
                    console.error("File JSON parsing error:", error);
                    showMessage(
                      "Error parsing JSON file. Please ensure it is valid JSON.",
                      "error",
                    );
                  }
                };
                reader.readAsText(file);
              }
            }}
            className="block w-full text-sm text-secondary-text file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary-bg file:text-accent hover:file:bg-primary-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          />
          <div className="my-4 text-center text-sm text-secondary-text">
            — OR —
          </div>
          <label
            htmlFor="import-json-text"
            className="block text-sm font-medium text-primary-text mb-2"
          >
            Paste JSON Data
          </label>
          <textarea
            id="import-json-text"
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            className="w-full h-48 px-3 py-2 border border-border rounded-md focus:ring-accent focus:border-accent resize-y themed-input"
            placeholder='[{"title": "Example", "url": "https://example.com", "tags": ["test"]}]'
          ></textarea>
          <button
            onClick={handleJsonImport}
            className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
          >
            Import JSON Data
          </button>
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
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                  onImportHtml(event.target.result);
                };
                reader.readAsText(file);
              }
            }}
            className="block w-full text-sm text-secondary-text file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary-bg file:text-accent hover:file:bg-primary-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          />
          <div className="my-4 text-center text-sm text-secondary-text">
            — OR —
          </div>
          <label
            htmlFor="import-html-text"
            className="block text-sm font-medium text-primary-text mb-2"
          >
            Paste HTML Data
          </label>
          <textarea
            id="import-html-text"
            value={importHtmlText}
            onChange={(e) => setImportHtmlText(e.target.value)}
            className="w-full h-48 px-3 py-2 border border-border rounded-md focus:ring-accent focus:border-accent resize-y themed-input"
            placeholder="<!DOCTYPE NETSCAPE-Bookmark-file-1>..."
          ></textarea>
          <button
            onClick={handleHtmlImport}
            className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
          >
            Import HTML Data
          </button>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-secondary-bg text-primary-text rounded-md hover:bg-primary-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default ImportExportContent;
