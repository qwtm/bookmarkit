// ARCH-06: Encapsulates theme state, persistence, and CSS variable application.

import { useCallback, useEffect, useState } from "react";

const DEFAULT_THEME = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f9fafb",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  border: "#d1d5db",
  accent: "#3b82f6",
  accentHover: "#2563eb",
};

const REQUIRED_THEME_KEYS = [
  "bgPrimary", "bgSecondary", "textPrimary", "textSecondary",
  "border", "accent", "accentHover",
];

function applyThemeToDom(theme) {
  const t = theme || DEFAULT_THEME;
  const root = document.documentElement;
  root.style.setProperty("--bg-primary",     t.bgPrimary     || "#ffffff");
  root.style.setProperty("--bg-secondary",   t.bgSecondary   || "#f9fafb");
  root.style.setProperty("--text-primary",   t.textPrimary   || "#111827");
  root.style.setProperty("--text-secondary", t.textSecondary || "#6b7280");
  root.style.setProperty("--border",         t.border        || "#d1d5db");
  root.style.setProperty("--accent",         t.accent        || "#3b82f6");
  root.style.setProperty("--accent-hover",   t.accentHover   || "#2563eb");
}

async function saveThemeToPersistence(key, value) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage) {
      await chrome.storage.local.set({ [key]: value });
    } else {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  } catch {}
}

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState("default");
  const [themes, setThemes] = useState({ default: DEFAULT_THEME });

  // Load persisted themes on mount
  useEffect(() => {
    (async () => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage) {
          const result = await chrome.storage.local.get(["bm_current_theme", "bm_themes"]);
          setCurrentTheme(result.bm_current_theme || "default");
          const parsed = result.bm_themes ? JSON.parse(result.bm_themes) : {};
          setThemes((prev) => ({ ...parsed, ...prev }));
        } else {
          const theme = localStorage.getItem("bm_current_theme") || "default";
          setCurrentTheme(theme);
          const raw = localStorage.getItem("bm_themes");
          const parsed = raw ? JSON.parse(raw) : {};
          setThemes((prev) => ({ ...parsed, ...prev }));
        }
      } catch (e) {
        console.error("Failed to load themes:", e);
      }
    })();
  }, []);

  // Apply CSS variables whenever theme changes
  useEffect(() => {
    applyThemeToDom(themes[currentTheme] || themes.default);
  }, [currentTheme, themes]);

  const selectTheme = useCallback((themeName) => {
    setCurrentTheme(themeName);
    saveThemeToPersistence("bm_current_theme", themeName);
  }, []);

  // SEC-07: Upload validation lives here
  const uploadTheme = useCallback(async (file, showMessage) => {
    if (!file) return;
    if (file.size > 100 * 1024) {
      showMessage("Theme file is too large. Maximum allowed size is 100 KB.", "error");
      return;
    }
    try {
      const text = await file.text();
      let themeData;
      if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
        const yaml = await import("js-yaml");
        themeData = yaml.load(text);
      } else {
        themeData = JSON.parse(text);
      }
      if (!themeData || typeof themeData !== "object" || Array.isArray(themeData)) {
        showMessage("Invalid theme format. Expected a JSON object with color properties.", "error");
        return;
      }
      const unknownKeys = Object.keys(themeData).filter((k) => !REQUIRED_THEME_KEYS.includes(k));
      if (unknownKeys.length > 0) {
        showMessage(`Theme contains unknown properties: ${unknownKeys.join(", ")}. Only the 7 color properties are allowed.`, "error");
        return;
      }
      const missing = REQUIRED_THEME_KEYS.filter((key) => !themeData[key]);
      if (missing.length > 0) {
        showMessage(`Theme is missing required properties: ${missing.join(", ")}`, "error");
        return;
      }
      const isSafeColor = (v) => {
        if (typeof v !== "string" || !v.trim()) return false;
        return !/[;<>{}]|url\s*\(|expression\s*\(|javascript\s*:/i.test(v);
      };
      const invalidKeys = REQUIRED_THEME_KEYS.filter((k) => !isSafeColor(themeData[k]));
      if (invalidKeys.length > 0) {
        showMessage("Theme contains invalid color values. Use valid CSS colors (e.g., #rrggbb, rgb(), hsl(), named colors).", "error");
        return;
      }
      const themeName = file.name.replace(/\.(json|yaml|yml)$/i, "");
      setThemes((prev) => {
        const next = { ...prev, [themeName]: themeData };
        saveThemeToPersistence("bm_themes", JSON.stringify(next));
        return next;
      });
      showMessage(`Theme "${themeName}" uploaded successfully.`, "success");
    } catch {
      showMessage("Failed to upload theme. Please ensure the file is valid JSON or YAML.", "error");
    }
  }, []);

  return { currentTheme, themes, selectTheme, uploadTheme };
}
