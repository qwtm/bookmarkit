import React, { useEffect, useState } from "react";
import { LLM_PROVIDERS, createLLM } from "../llm/index.js";

// ARCH-04: Module-level cache for listModels() results, keyed by "provider|apiKey|baseUrl".
// A 5-minute TTL prevents hammering the models endpoint when the modal is repeatedly opened.
const _modelsCache = {};
const MODELS_CACHE_TTL = 5 * 60 * 1000;

// Options modal that displays and allows changing the current LLM provider and its options
const OptionsModal = ({
  provider,
  providerOptions = {},
  onChange,
  onChangeOptions,
  currentTheme,
  themes,
  onThemeChange,
  onThemeUpload,
  onClose,
}) => {
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [showExample, setShowExample] = useState(false);

  const fetchModels = async (forceRefresh = false) => {
    // ARCH-04: Check module-level cache before making a network request
    const cacheKey = `${provider}|${providerOptions.apiKey || ""}|${providerOptions.baseUrl || ""}`;
    if (!forceRefresh) {
      const cached = _modelsCache[cacheKey];
      if (cached && Date.now() < cached.expiresAt) {
        setModels(cached.models);
        return;
      }
    }

    setIsLoadingModels(true);
    setModelsError("");
    try {
      const opts = {
        apiKey: providerOptions.apiKey || "",
        model: providerOptions.model || "",
        baseUrl: providerOptions.baseUrl || undefined,
      };
      const llm = createLLM(provider, opts);
      const list = (await llm.listModels?.()) || [];
      const models = Array.isArray(list) ? list : [];
      // Store in module-level cache with TTL
      _modelsCache[cacheKey] = { models, expiresAt: Date.now() + MODELS_CACHE_TTL };
      setModels(models);
    } catch (e) {
      setModels([]);
      setModelsError(e?.message || "Failed to load models");
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    // Auto-fetch on open and when provider or core connection info changes
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, providerOptions.apiKey, providerOptions.baseUrl]);

  const providerEntries = [
    { value: LLM_PROVIDERS.GEMINI, label: "Gemini" },
    { value: LLM_PROVIDERS.OPENAI, label: "OpenAI (ChatGPT)" },
    { value: LLM_PROVIDERS.GROK, label: "Grok" },
    { value: LLM_PROVIDERS.OLLAMA, label: "Ollama (Local)" },
    { value: LLM_PROVIDERS.LMSTUDIO, label: "LM Studio (Local)" },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-primary-bg rounded-lg shadow-xl max-w-md w-full m-4">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold text-primary-text">Options</h2>
            <button
              onClick={onClose}
              className="text-secondary-text hover:text-primary-text"
              aria-label="Close options"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="llm-provider"
                className="block text-sm font-medium text-primary-text mb-1"
              >
                LLM Provider
              </label>
              <select
                id="llm-provider"
                className="w-full border rounded-md px-3 py-2 themed-input"
                value={provider}
                onChange={(e) => onChange?.(e.target.value)}
              >
                {providerEntries.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-secondary-text mt-1">
                Changes apply immediately and persist to this browser.
              </p>
            </div>
            {/* Provider-specific settings */}
            {(provider === LLM_PROVIDERS.GEMINI ||
              provider === LLM_PROVIDERS.OPENAI ||
              provider === LLM_PROVIDERS.GROK) && (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="api-key"
                    className="block text-sm font-medium text-primary-text mb-1"
                  >
                    API Key
                  </label>
                  <input
                    id="api-key"
                    type="password"
                    className="w-full border rounded-md px-3 py-2 themed-input"
                    placeholder="Enter API key"
                    value={providerOptions.apiKey || ""}
                    onChange={(e) =>
                      onChangeOptions?.({ apiKey: e.target.value })
                    }
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="model"
                      className="block text-sm font-medium text-primary-text"
                    >
                      Model
                    </label>
                    <button
                      type="button"
                      onClick={() => fetchModels(true)}
                      className="text-xs text-accent hover:underline disabled:text-secondary-text"
                      disabled={isLoadingModels}
                      aria-label="Refresh model list"
                    >
                      {isLoadingModels ? "Loading…" : "Refresh"}
                    </button>
                  </div>
                  {models && models.length > 0 ? (
                    <select
                      id="model"
                      className="w-full border rounded-md px-3 py-2 themed-input"
                      value={providerOptions.model || models[0] || ""}
                      onChange={(e) =>
                        onChangeOptions?.({ model: e.target.value })
                      }
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="model"
                      type="text"
                      className="w-full border rounded-md px-3 py-2 themed-input"
                      placeholder={
                        provider === LLM_PROVIDERS.GEMINI
                          ? "gemini-2.0-flash"
                          : provider === LLM_PROVIDERS.OPENAI
                            ? "gpt-4o-mini"
                            : "grok-beta"
                      }
                      value={providerOptions.model || ""}
                      onChange={(e) =>
                        onChangeOptions?.({ model: e.target.value })
                      }
                    />
                  )}
                  {modelsError && (
                    <p className="text-xs text-red-600 mt-1">{modelsError}</p>
                  )}
                </div>
                {(provider === LLM_PROVIDERS.OPENAI ||
                  provider === LLM_PROVIDERS.GROK) && (
                  <div>
                    <label
                      htmlFor="base-url"
                      className="block text-sm font-medium text-primary-text mb-1"
                    >
                      Base URL (optional)
                    </label>
                    <input
                      id="base-url"
                      type="text"
                      className="w-full border rounded-md px-3 py-2 themed-input"
                      placeholder={
                        provider === LLM_PROVIDERS.OPENAI
                          ? "https://api.openai.com/v1"
                          : "https://api.x.ai/v1"
                      }
                      value={providerOptions.baseUrl || ""}
                      onChange={(e) =>
                        onChangeOptions?.({ baseUrl: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            )}
            {(provider === LLM_PROVIDERS.OLLAMA ||
              provider === LLM_PROVIDERS.LMSTUDIO) && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="ollama-model"
                      className="block text-sm font-medium text-primary-text"
                    >
                      Model
                    </label>
                    <button
                      type="button"
                      onClick={() => fetchModels(true)}
                      className="text-xs text-accent hover:underline disabled:text-secondary-text"
                      disabled={isLoadingModels}
                      aria-label="Refresh model list"
                    >
                      {isLoadingModels ? "Loading…" : "Refresh"}
                    </button>
                  </div>
                  {models && models.length > 0 ? (
                    <select
                      id="ollama-model"
                      className="w-full border rounded-md px-3 py-2 themed-input"
                      value={providerOptions.model || models[0] || ""}
                      onChange={(e) =>
                        onChangeOptions?.({ model: e.target.value })
                      }
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="ollama-model"
                      type="text"
                      className="w-full border rounded-md px-3 py-2 themed-input"
                      placeholder={
                        provider === LLM_PROVIDERS.OLLAMA
                          ? "llama3.1"
                          : "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF"
                      }
                      value={providerOptions.model || ""}
                      onChange={(e) =>
                        onChangeOptions?.({ model: e.target.value })
                      }
                    />
                  )}
                  {modelsError && (
                    <p className="text-xs text-red-600 mt-1">{modelsError}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="ollama-url"
                    className="block text-sm font-medium text-primary-text mb-1"
                  >
                    Base URL
                  </label>
                  <input
                    id="ollama-url"
                    type="text"
                    className="w-full border rounded-md px-3 py-2 themed-input"
                    placeholder={
                      provider === LLM_PROVIDERS.OLLAMA
                        ? "http://localhost:11434"
                        : "http://localhost:1234"
                    }
                    value={providerOptions.baseUrl || ""}
                    onChange={(e) =>
                      onChangeOptions?.({ baseUrl: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            {/* Theme settings */}
            <div>
              <label
                htmlFor="theme-select"
                className="block text-sm font-medium text-primary-text mb-1"
              >
                Theme
              </label>
              <select
                id="theme-select"
                className="w-full border rounded-md px-3 py-2 themed-input"
                value={currentTheme}
                onChange={(e) => onThemeChange?.(e.target.value)}
              >
                {Object.keys(themes).map((themeName) => (
                  <option key={themeName} value={themeName}>
                    {themeName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-secondary-text mt-1">
                Select a theme to apply.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-primary-text">
                  Upload Theme
                </label>
                <button
                  type="button"
                  onClick={() => setShowExample(true)}
                  className="p-1 rounded-full text-secondary-text hover:text-primary-text hover:bg-secondary-bg focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
                  aria-label="Show theme example"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 115.82 1c-.44.86-1.26 1.3-1.91 1.63-.51.26-.75.52-.75.87v.5" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </button>
              </div>
              <input
                type="file"
                accept=".json,.yaml,.yml"
                onChange={(e) => onThemeUpload?.(e.target.files[0])}
                className="block w-full text-sm text-secondary-text file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary-bg file:text-accent hover:file:bg-primary-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              />
              <p className="text-xs text-secondary-text mt-1">
                Upload a JSON or YAML theme file.
              </p>
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {showExample && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && setShowExample(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-primary-bg rounded-lg shadow-xl max-w-lg w-full m-4">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-primary-text">
                  Theme File Format
                </h3>
                <button
                  onClick={() => setShowExample(false)}
                  className="text-secondary-text hover:text-primary-text"
                  aria-label="Close example"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <p className="mb-4 text-secondary-text">
                Upload a JSON or YAML file with the following structure:
              </p>
              <pre className="p-4 rounded text-sm overflow-x-auto bg-secondary-bg text-primary-text">
                {`{
  "bgPrimary": "#1f2937",
  "bgSecondary": "#111827",
  "textPrimary": "#f9fafb",
  "textSecondary": "#d1d5db",
  "border": "#374151",
  "accent": "#3b82f6",
  "accentHover": "#2563eb"
}`}
              </pre>
              <p className="mt-4 text-sm text-secondary-text">
                All properties are required. Colors should be in hex format
                (#rrggbb).
              </p>
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowExample(false)}
                  className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsModal;
