import React, { useEffect, useState } from "react";
import { LLM_PROVIDERS, createLLM } from "../llm/index.js";
import { useDebounce } from "../hooks/useDebounce.js";
import KeyEncryptionSection from "./KeyEncryptionSection.jsx";
import { Banner, Button, IconButton, Input, Modal, Select } from "./DesignSystem.jsx";

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
  encryption = { encrypted: false, locked: false },
  onEnableEncryption,
  onDisableEncryption,
  onUnlock,
  currentTheme,
  themes,
  onThemeChange,
  onThemeUpload,
  remoteFavicons = false,
  onRemoteFaviconsChange,
  onClose,
}) => {
  const [models, setModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [baseUrlError, setBaseUrlError] = useState("");
  const [showExample, setShowExample] = useState(false);

  const debouncedApiKey = useDebounce(providerOptions.apiKey || "", 600);
  const debouncedBaseUrl = useDebounce(providerOptions.baseUrl || "", 600);

  const isValidBaseUrl = (url) => {
    if (!url) return true; // empty = use provider default, always OK
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

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
    if (!isValidBaseUrl(debouncedBaseUrl)) {
      setBaseUrlError("Not a Valid Url Pattern");
      return;
    }
    setBaseUrlError("");
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, debouncedApiKey, debouncedBaseUrl]);

  const providerEntries = [
    { value: LLM_PROVIDERS.GEMINI, label: "Gemini" },
    { value: LLM_PROVIDERS.OPENAI, label: "OpenAI (ChatGPT)" },
    { value: LLM_PROVIDERS.GROK, label: "Grok" },
    { value: LLM_PROVIDERS.OLLAMA, label: "Ollama (Local)" },
    { value: LLM_PROVIDERS.LMSTUDIO, label: "LM Studio (Local)" },
  ];

  // Models that do not accept a temperature parameter (OpenAI o1/o3 reasoning series)
  const modelSupportsTemperature = (providerKey, modelName) => {
    if (providerKey === LLM_PROVIDERS.OPENAI && modelName) {
      return !/^o[13]/i.test(modelName);
    }
    return true;
  };

  return (
    <>
      <Modal title="Options" closeLabel="Close options" onClose={onClose} size="lg">
        {/* Read-only status: shows what provider + model will actually be used */}
        <div className="mb-4 p-3 rounded-md bg-secondary-bg border border-border text-sm font-mono">
          <span className="text-secondary-text">Active: </span>
          <span className="text-primary-text font-semibold">{provider || "none"}</span>
          {providerOptions.model && (
            <>
              <span className="text-secondary-text"> / </span>
              <span className="text-primary-text">{providerOptions.model}</span>
            </>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-primary-text">Provider &amp; model</h3>
          <Select
            label="LLM Provider"
            id="llm-provider"
            value={provider}
            onChange={(e) => onChange?.(e.target.value)}
            options={providerEntries}
            hint="Changes apply immediately and persist to this browser."
          />
          {/* Provider-specific settings */}
          {(provider === LLM_PROVIDERS.GEMINI ||
            provider === LLM_PROVIDERS.OPENAI ||
            provider === LLM_PROVIDERS.GROK) && (
            <div className="space-y-3">
              <Input
                label="API Key"
                id="api-key"
                type="password"
                placeholder={encryption.locked ? "Locked — unlock below to edit" : "Enter API key"}
                value={providerOptions.apiKey || ""}
                disabled={encryption.locked}
                onChange={(e) => onChangeOptions?.({ apiKey: e.target.value })}
              />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="model" className="block text-sm font-medium text-primary-text">
                    Model
                  </label>
                  <Button
                    type="button"
                    intent="ghost"
                    size="sm"
                    onClick={() => fetchModels(true)}
                    disabled={isLoadingModels}
                    loading={isLoadingModels}
                    aria-label="Refresh model list"
                  >
                    {isLoadingModels ? "Loading…" : "Refresh"}
                  </Button>
                </div>
                {models && models.length > 0 ? (
                  <Select
                    id="model"
                    value={providerOptions.model || models[0] || ""}
                    onChange={(e) => onChangeOptions?.({ model: e.target.value })}
                    options={models}
                  />
                ) : (
                  <Input
                    id="model"
                    type="text"
                    placeholder={
                      provider === LLM_PROVIDERS.GEMINI
                        ? "gemini-2.0-flash"
                        : provider === LLM_PROVIDERS.OPENAI
                          ? "gpt-4o-mini"
                          : "grok-beta"
                    }
                    value={providerOptions.model || ""}
                    onChange={(e) => onChangeOptions?.({ model: e.target.value })}
                  />
                )}
                {modelsError && (
                  <Banner tone="error" className="mt-1">
                    {modelsError}
                  </Banner>
                )}
              </div>
              {(provider === LLM_PROVIDERS.OPENAI || provider === LLM_PROVIDERS.GROK) && (
                <div>
                  <Input
                    label="Base URL (optional)"
                    id="base-url"
                    type="text"
                    placeholder={
                      provider === LLM_PROVIDERS.OPENAI
                        ? "https://api.openai.com/v1"
                        : "https://api.x.ai/v1"
                    }
                    value={providerOptions.baseUrl || ""}
                    onChange={(e) => onChangeOptions?.({ baseUrl: e.target.value })}
                  />
                  {baseUrlError && (
                    <Banner tone="warning" className="mt-1">
                      {baseUrlError}
                    </Banner>
                  )}
                </div>
              )}
            </div>
          )}
          {(provider === LLM_PROVIDERS.OLLAMA || provider === LLM_PROVIDERS.LMSTUDIO) && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="ollama-model"
                    className="block text-sm font-medium text-primary-text"
                  >
                    Model
                  </label>
                  <Button
                    type="button"
                    intent="ghost"
                    size="sm"
                    onClick={() => fetchModels(true)}
                    disabled={isLoadingModels}
                    loading={isLoadingModels}
                    aria-label="Refresh model list"
                  >
                    {isLoadingModels ? "Loading…" : "Refresh"}
                  </Button>
                </div>
                {models && models.length > 0 ? (
                  <Select
                    id="ollama-model"
                    value={providerOptions.model || models[0] || ""}
                    onChange={(e) => onChangeOptions?.({ model: e.target.value })}
                    options={models}
                  />
                ) : (
                  <Input
                    id="ollama-model"
                    type="text"
                    placeholder={
                      provider === LLM_PROVIDERS.OLLAMA
                        ? "llama3.1"
                        : "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF"
                    }
                    value={providerOptions.model || ""}
                    onChange={(e) => onChangeOptions?.({ model: e.target.value })}
                  />
                )}
                {modelsError && (
                  <Banner tone="error" className="mt-1">
                    {modelsError}
                  </Banner>
                )}
              </div>
              <div>
                <Input
                  label="Base URL"
                  id="ollama-url"
                  type="text"
                  placeholder={
                    provider === LLM_PROVIDERS.OLLAMA
                      ? "http://localhost:11434"
                      : "http://localhost:1234"
                  }
                  value={providerOptions.baseUrl || ""}
                  onChange={(e) => onChangeOptions?.({ baseUrl: e.target.value })}
                />
                {baseUrlError && (
                  <Banner tone="warning" className="mt-1">
                    {baseUrlError}
                  </Banner>
                )}
              </div>
            </div>
          )}
          {/* Temperature */}
          {(() => {
            const supportsTemp = modelSupportsTemperature(provider, providerOptions.model);
            const isEnabled = supportsTemp && !!providerOptions.enableTemperature;
            const tempValue =
              typeof providerOptions.temperature === "number" ? providerOptions.temperature : 1;
            return (
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enable-temperature"
                    checked={isEnabled}
                    disabled={!supportsTemp}
                    onChange={(e) => onChangeOptions?.({ enableTemperature: e.target.checked })}
                    className="rounded border-border accent-accent cursor-pointer disabled:cursor-not-allowed"
                  />
                  <label
                    htmlFor="enable-temperature"
                    className={`text-sm font-medium ${supportsTemp ? "text-primary-text" : "text-secondary-text"} cursor-pointer`}
                  >
                    Set temperature
                  </label>
                  {!supportsTemp && (
                    <span className="text-xs text-secondary-text">
                      (not supported by this model)
                    </span>
                  )}
                  {isEnabled && (
                    <span className="ml-auto text-sm tabular-nums text-primary-text">
                      {tempValue.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-secondary-text">
                  Higher values make responses more varied. Leave off to use the provider default.
                </p>
                {isEnabled && (
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-secondary-text">0</span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={tempValue}
                      onChange={(e) =>
                        onChangeOptions?.({ temperature: parseFloat(e.target.value) })
                      }
                      className="flex-1 accent-accent"
                      aria-label="Temperature value"
                    />
                    <span className="text-xs text-secondary-text">2</span>
                  </div>
                )}
              </div>
            );
          })()}
          {/* #29: encryption controls — shown for every provider so a locked key
                can always be unlocked, even on keyless providers (ollama/lmstudio). */}
          <KeyEncryptionSection
            encryption={encryption}
            onEnableEncryption={onEnableEncryption}
            onDisableEncryption={onDisableEncryption}
            onUnlock={onUnlock}
          />
          {/* Theme settings */}
          <div className="border-t border-border pt-4 space-y-4">
            <h3 className="text-lg font-semibold text-primary-text">Appearance</h3>
            <Select
              label="Theme"
              id="theme-select"
              value={currentTheme}
              onChange={(e) => onThemeChange?.(e.target.value)}
              options={Object.keys(themes)}
              hint="Select a theme to apply."
            />
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-primary-text">
                  Upload custom theme
                </label>
                <IconButton
                  type="button"
                  label="Show theme example"
                  size="sm"
                  onClick={() => setShowExample(true)}
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
                </IconButton>
              </div>
              <input
                type="file"
                accept=".json,.yaml,.yml"
                onChange={(e) => {
                  // #25: Clear the input so re-picking the same file after a
                  // rejected theme fires another change event.
                  const [file] = e.target.files;
                  e.target.value = "";
                  if (file) onThemeUpload?.(file);
                }}
                className="block w-full text-sm text-secondary-text file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary-bg file:text-accent hover:file:bg-primary-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              />
              <p className="text-xs text-secondary-text mt-1">Upload a JSON or YAML theme file.</p>
            </div>
          </div>
          {/* #39: favicons are a privacy decision, so the choice is explicit and off by default. */}
          <div className="border-t border-border pt-4">
            <h3 className="text-lg font-semibold text-primary-text mb-2">Privacy</h3>
            <label className="flex items-start gap-2 text-sm text-primary-text">
              <input
                type="checkbox"
                checked={remoteFavicons}
                onChange={(e) => onRemoteFaviconsChange?.(e.target.checked)}
                className="mt-0.5 accent-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              />
              <span>
                Load site icons from the web
                <span className="block text-xs text-secondary-text">
                  Off by default: no icon is fetched over the network. Bookmarkit uses your
                  browser&rsquo;s own icon cache when the extension can, and a neutral placeholder
                  otherwise. When on, each visible bookmark fetches its icon &mdash; from the
                  address saved with it, or from google.com by domain when it has none.
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-border">
          <p className="text-xs text-secondary-text">Changes save to this browser.</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>

      {showExample && (
        <Modal
          title="Theme File Format"
          closeLabel="Close example"
          onClose={() => setShowExample(false)}
          size="lg"
          footer={<Button onClick={() => setShowExample(false)}>Close</Button>}
        >
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
            All properties are required. Colors should be in hex format (#rrggbb).
          </p>
        </Modal>
      )}
    </>
  );
};

export default OptionsModal;
