// #26: Where the LLM provider settings live, and how the API key inside them is
// protected. This was two hundred lines in the middle of BookmarkApp, which
// otherwise has nothing to do with storage areas or key derivation.
//
// Three rules the storage code exists to keep:
//
// - #9: the key is a secret, so it goes in chrome.storage.local, never .sync,
//   which would replicate it to Google's backend and every signed-in device.
//   Settings written by an earlier version are migrated out of sync on load.
// - #29: with a passphrase set, the options are encrypted at rest, and a session
//   starts locked — the app can read that a key exists but not what it is.
// - #36: the plaintext copy is removed only after the encrypted write succeeds,
//   so a failed write cannot lose the key.

import { useCallback, useEffect, useRef, useState } from "react";
import { LLM_PROVIDERS } from "../llm/index.js";
import { decryptString, encryptString, isEncryptedBlob } from "../utils/keyCrypto.js";

const PROVIDER_KEY = "bm_runtime_llm_provider";
const OPTIONS_KEY = "bm_runtime_llm_options";
const OPTIONS_ENC_KEY = "bm_runtime_llm_options_enc";

const buildDefaultProvider = () => {
  const configured =
    (typeof __llm_provider__ !== "undefined" && __llm_provider__) || LLM_PROVIDERS.GEMINI;
  return (configured || LLM_PROVIDERS.GEMINI).toString().toLowerCase();
};

/** chrome.storage.local when running as the extension, localStorage otherwise. */
const localArea = () =>
  typeof chrome !== "undefined" && chrome.storage?.local ? chrome.storage.local : null;

const readSetting = async (key) => {
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
const writeSetting = async (key, value) => {
  try {
    const area = localArea();
    if (area) await area.set({ [key]: value });
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const dropSetting = async (key) => {
  try {
    const area = localArea();
    if (area) await area.remove(key);
    else localStorage.removeItem(key);
  } catch {
    /* nothing to drop */
  }
};

/**
 * #9: move any secrets a prior version wrote to chrome.storage.sync into
 * device-local storage, then delete them from sync so they stop replicating.
 */
const migrateOutOfSync = async () => {
  const area = localArea();
  if (!area || !chrome.storage?.sync) return;
  try {
    const synced = await chrome.storage.sync.get([PROVIDER_KEY, OPTIONS_KEY]);
    const carried = Object.fromEntries(
      [PROVIDER_KEY, OPTIONS_KEY].filter((key) => synced[key]).map((key) => [key, synced[key]])
    );
    if (Object.keys(carried).length === 0) return;
    await area.set(carried);
    await chrome.storage.sync.remove([PROVIDER_KEY, OPTIONS_KEY]);
  } catch {
    /* sync unavailable — nothing to migrate */
  }
};

/**
 * Settings written to localStorage by the pre-extension web build, moved into
 * the extension's own storage the first time it sees them.
 */
const adoptLegacyLocalStorage = async (key) => {
  if (!localArea()) return undefined;
  const legacy = localStorage.getItem(key);
  if (!legacy) return undefined;
  await writeSetting(key, legacy);
  localStorage.removeItem(key);
  return legacy;
};

const parseOptions = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * The LLM provider in use, its options, and the passphrase lock around them.
 *
 * @param {(message: string, type?: string) => void} showMessage How to tell the
 *   user that a key could not be encrypted — the one thing here they must know
 *   about rather than have silently retried.
 */
export function useLLMSettings(showMessage) {
  const [provider, setProviderState] = useState(buildDefaultProvider);
  const [options, setOptions] = useState({});
  const [encrypted, setEncrypted] = useState(false);
  // Encrypted but not yet unlocked this session.
  const [locked, setLocked] = useState(false);
  // Held in memory only, and only after the user unlocks or enables encryption.
  const passphraseRef = useRef("");

  useEffect(() => {
    (async () => {
      try {
        await migrateOutOfSync();
        const storedProvider =
          (await readSetting(PROVIDER_KEY)) ?? (await adoptLegacyLocalStorage(PROVIDER_KEY));
        if (storedProvider) setProviderState(storedProvider.toString().toLowerCase());

        const blob = await readSetting(OPTIONS_ENC_KEY);
        if (isEncryptedBlob(blob)) {
          setEncrypted(true);
          setLocked(true);
          return;
        }
        const raw =
          (await readSetting(OPTIONS_KEY)) ?? (await adoptLegacyLocalStorage(OPTIONS_KEY));
        const parsed = raw && parseOptions(raw);
        if (parsed) setOptions(parsed);
      } catch (e) {
        console.error("Failed to load LLM settings:", e);
      }
    })();
  }, []);

  const setProvider = useCallback((value) => {
    const next = (value || "").toString().toLowerCase();
    setProviderState(next);
    writeSetting(PROVIDER_KEY, next);
  }, []);

  const persist = useCallback(
    async (nextOptions) => {
      try {
        if (!encrypted || !passphraseRef.current) {
          await writeSetting(OPTIONS_KEY, JSON.stringify(nextOptions));
          return;
        }
        const blob = await encryptString(JSON.stringify(nextOptions), passphraseRef.current);
        // #36: the plaintext goes only once the encrypted copy is really there.
        if (await writeSetting(OPTIONS_ENC_KEY, blob)) await dropSetting(OPTIONS_KEY);
      } catch (e) {
        console.error("Failed to persist LLM options:", e);
      }
    },
    [encrypted]
  );

  /** Merge changes into the current provider's options and persist the result. */
  const updateProviderOptions = useCallback(
    (changes) => {
      setOptions((prev) => {
        const next = {
          ...(prev || {}),
          [provider]: { ...(prev?.[provider] || {}), ...(changes || {}) },
        };
        persist(next);
        return next;
      });
    },
    [provider, persist]
  );

  const enableEncryption = useCallback(
    async (passphrase) => {
      if (!passphrase) return;
      try {
        const blob = await encryptString(JSON.stringify(options), passphrase);
        // #36: staying plaintext is recoverable; losing the key is not.
        if (!(await writeSetting(OPTIONS_ENC_KEY, blob))) {
          showMessage("Couldn't save the encrypted key. Encryption not enabled.", "error");
          return;
        }
        await dropSetting(OPTIONS_KEY);
        passphraseRef.current = passphrase;
        setEncrypted(true);
        setLocked(false);
        showMessage("API key encrypted. You'll enter this passphrase once per session.", "success");
      } catch {
        showMessage("Couldn't encrypt the API key. Encryption not enabled.", "error");
      }
    },
    [options, showMessage]
  );

  const disableEncryption = useCallback(async () => {
    // Still locked means a forgotten passphrase: there is nothing to write back
    // in plaintext, so clear the options and let the user enter a fresh key.
    const keep = locked ? {} : options;
    passphraseRef.current = "";
    await dropSetting(OPTIONS_ENC_KEY);
    await writeSetting(OPTIONS_KEY, JSON.stringify(keep));
    if (locked) setOptions({});
    setEncrypted(false);
    setLocked(false);
  }, [locked, options]);

  /** @returns {Promise<boolean>} false for a wrong passphrase or corrupt blob. */
  const unlock = useCallback(async (passphrase) => {
    try {
      const blob = await readSetting(OPTIONS_ENC_KEY);
      const parsed = parseOptions(await decryptString(blob, passphrase));
      if (!parsed) return false;
      setOptions(parsed);
      passphraseRef.current = passphrase;
      setLocked(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    provider,
    setProvider,
    /** Options for every provider, keyed by name — what gets persisted. */
    options,
    /** Just the current provider's options, which is what callers pass on. */
    providerOptions: options[provider] || {},
    updateProviderOptions,
    encryption: { encrypted, locked },
    enableEncryption,
    disableEncryption,
    unlock,
  };
}
