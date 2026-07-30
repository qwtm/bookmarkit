// One place that knows where a setting lives.
//
// The same UI runs as a Chrome extension and as a web app, so anything persisted
// has two possible homes: `chrome.storage.local` when the extension APIs are
// there, `localStorage` when they are not. Callers should not have to know which.
//
// Only the local area, deliberately. `chrome.storage.sync` replicates to Google's
// backend and every signed-in device, which is wrong for an API key (#9) and
// wrong for anything else we have wanted to keep so far.

/** chrome.storage.local when running as the extension, localStorage otherwise. */
const localArea = () =>
  typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;

export const readSetting = async (key) => {
  try {
    const area = localArea();
    if (!area) return localStorage.getItem(key);
    const result = await area.get([key]);
    return result[key];
  } catch {
    return undefined;
  }
};

/** #36: reports whether the write landed, so a caller can keep its fallback. */
export const writeSetting = async (key, value) => {
  try {
    const area = localArea();
    if (area) await area.set({ [key]: value });
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const dropSetting = async (key) => {
  try {
    const area = localArea();
    if (area) await area.remove(key);
    else localStorage.removeItem(key);
  } catch {
    /* nothing to drop */
  }
};

/**
 * Settings written to localStorage by the pre-extension web build, moved into
 * the extension's own storage the first time it sees them.
 */
export const adoptLegacyLocalStorage = async (key) => {
  if (!localArea()) return undefined;
  const legacy = localStorage.getItem(key);
  if (!legacy) return undefined;
  await writeSetting(key, legacy);
  localStorage.removeItem(key);
  return legacy;
};
