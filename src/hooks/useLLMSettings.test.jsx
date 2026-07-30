import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useLLMSettings } from "./useLLMSettings.js";

// Real crypto, because the point of these tests is what ends up in storage.
const { encryptString } = await import("../utils/keyCrypto.js");

let settings;

const Probe = ({ showMessage = () => {} }) => {
  settings = useLLMSettings(showMessage);
  return (
    <div>
      <span data-testid="provider">{settings.provider}</span>
      <span data-testid="key">{settings.providerOptions.apiKey || ""}</span>
      <span data-testid="state">
        {settings.encryption.encrypted ? "encrypted" : "plain"}/
        {settings.encryption.locked ? "locked" : "open"}
      </span>
    </div>
  );
};

/** A chrome.storage area over a plain object, with the failure mode we care about. */
function fakeArea(initial = {}) {
  const data = { ...initial };
  return {
    data,
    failWrites: false,
    get: vi.fn(async (keys) =>
      Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]))
    ),
    set: vi.fn(async function (entries) {
      if (this.failWrites) throw new Error("quota exceeded");
      Object.assign(data, entries);
    }),
    remove: vi.fn(async (key) => {
      for (const k of [].concat(key)) delete data[k];
    }),
  };
}

const installChrome = (local, sync) => {
  globalThis.chrome = { storage: { local, ...(sync ? { sync } : {}) } };
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete globalThis.chrome;
  settings = undefined;
});

describe("useLLMSettings (#26)", () => {
  it("reads the provider and options already in device-local storage", async () => {
    installChrome(
      fakeArea({
        bm_runtime_llm_provider: "OpenAI",
        bm_runtime_llm_options: JSON.stringify({ openai: { apiKey: "sk-live" } }),
      })
    );

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("provider")).toHaveTextContent("openai"));
    expect(screen.getByTestId("key")).toHaveTextContent("sk-live");
    expect(screen.getByTestId("state")).toHaveTextContent("plain/open");
  });

  // #9: the API key is a secret. A prior version wrote it to chrome.storage.sync,
  // which replicates it to Google's backend and every signed-in device.
  it("moves settings a prior version put in sync storage into local, and deletes them from sync", async () => {
    const local = fakeArea();
    const sync = fakeArea({
      bm_runtime_llm_provider: "gemini",
      bm_runtime_llm_options: JSON.stringify({ gemini: { apiKey: "sk-synced" } }),
    });
    installChrome(local, sync);

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("key")).toHaveTextContent("sk-synced"));
    expect(local.data.bm_runtime_llm_options).toContain("sk-synced");
    expect(sync.data.bm_runtime_llm_provider).toBeUndefined();
    expect(sync.data.bm_runtime_llm_options).toBeUndefined();
  });

  it("never writes a key to sync storage afterwards", async () => {
    const local = fakeArea();
    const sync = fakeArea();
    installChrome(local, sync);
    render(<Probe />);
    await waitFor(() => expect(settings).toBeDefined());

    await act(async () => settings.updateProviderOptions({ apiKey: "sk-new" }));

    expect(local.data.bm_runtime_llm_options).toContain("sk-new");
    expect(sync.set).not.toHaveBeenCalled();
  });

  // #29: a session starts locked. The app can see that a key exists without
  // being able to read it, and the options are not silently replaced with {}.
  it("starts locked when the stored options are encrypted", async () => {
    const blob = await encryptString(
      JSON.stringify({ gemini: { apiKey: "sk-secret" } }),
      "hunter2"
    );
    installChrome(fakeArea({ bm_runtime_llm_options_enc: blob }));

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("encrypted/locked"));
    expect(screen.getByTestId("key")).toHaveTextContent("");
  });

  it("unlocks with the right passphrase and refuses the wrong one", async () => {
    const blob = await encryptString(
      JSON.stringify({ gemini: { apiKey: "sk-secret" } }),
      "hunter2"
    );
    installChrome(fakeArea({ bm_runtime_llm_options_enc: blob }));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));

    await act(async () => expect(await settings.unlock("wrong")).toBe(false));
    expect(screen.getByTestId("state")).toHaveTextContent("locked");

    await act(async () => expect(await settings.unlock("hunter2")).toBe(true));
    expect(screen.getByTestId("key")).toHaveTextContent("sk-secret");
    expect(screen.getByTestId("state")).toHaveTextContent("encrypted/open");
  });

  // #36: a failed encrypted write must not take the plaintext copy with it.
  // Staying unencrypted is recoverable; losing the key is not.
  it("keeps the plaintext key when the encrypted write fails", async () => {
    const local = fakeArea({
      bm_runtime_llm_options: JSON.stringify({ gemini: { apiKey: "sk-live" } }),
    });
    installChrome(local);
    const showMessage = vi.fn();
    render(<Probe showMessage={showMessage} />);
    await waitFor(() => expect(screen.getByTestId("key")).toHaveTextContent("sk-live"));

    local.failWrites = true;
    await act(async () => settings.enableEncryption("hunter2"));

    expect(local.data.bm_runtime_llm_options).toContain("sk-live");
    expect(local.data.bm_runtime_llm_options_enc).toBeUndefined();
    expect(screen.getByTestId("state")).toHaveTextContent("plain/open");
    expect(showMessage).toHaveBeenCalledWith(expect.stringMatching(/not enabled/i), "error");
  });

  it("drops the plaintext copy once the encrypted one is really there", async () => {
    const local = fakeArea({
      bm_runtime_llm_options: JSON.stringify({ gemini: { apiKey: "sk-live" } }),
    });
    installChrome(local);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("key")).toHaveTextContent("sk-live"));

    await act(async () => settings.enableEncryption("hunter2"));

    expect(local.data.bm_runtime_llm_options_enc).toBeTruthy();
    expect(local.data.bm_runtime_llm_options).toBeUndefined();
    expect(screen.getByTestId("state")).toHaveTextContent("encrypted/open");
  });

  // A forgotten passphrase is a dead end: there is no plaintext to restore, so
  // turning encryption off has to clear the options rather than pretend.
  it("clears the options when encryption is turned off while still locked", async () => {
    const blob = await encryptString(
      JSON.stringify({ gemini: { apiKey: "sk-lost" } }),
      "forgotten"
    );
    const local = fakeArea({ bm_runtime_llm_options_enc: blob });
    installChrome(local);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("locked"));

    await act(async () => settings.disableEncryption());

    expect(local.data.bm_runtime_llm_options_enc).toBeUndefined();
    expect(local.data.bm_runtime_llm_options).toBe("{}");
    expect(screen.getByTestId("state")).toHaveTextContent("plain/open");
  });

  // The web build has no chrome.storage at all.
  it("falls back to localStorage outside the extension", async () => {
    localStorage.setItem("bm_runtime_llm_provider", "ollama");
    localStorage.setItem("bm_runtime_llm_options", JSON.stringify({ ollama: { apiKey: "local" } }));

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("provider")).toHaveTextContent("ollama"));
    expect(screen.getByTestId("key")).toHaveTextContent("local");
  });

  it("adopts settings the web build left in localStorage", async () => {
    localStorage.setItem("bm_runtime_llm_provider", "openai");
    const local = fakeArea();
    installChrome(local);

    render(<Probe />);

    await waitFor(() => expect(local.data.bm_runtime_llm_provider).toBe("openai"));
    expect(localStorage.getItem("bm_runtime_llm_provider")).toBeNull();
  });

  it("keeps other providers' options when one provider's change", async () => {
    const local = fakeArea({
      bm_runtime_llm_provider: "gemini",
      bm_runtime_llm_options: JSON.stringify({
        gemini: { apiKey: "sk-gemini" },
        openai: { apiKey: "sk-openai" },
      }),
    });
    installChrome(local);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("key")).toHaveTextContent("sk-gemini"));

    await act(async () => settings.updateProviderOptions({ baseUrl: "https://proxy.test" }));

    const stored = JSON.parse(local.data.bm_runtime_llm_options);
    expect(stored.gemini).toEqual({ apiKey: "sk-gemini", baseUrl: "https://proxy.test" });
    expect(stored.openai).toEqual({ apiKey: "sk-openai" });
  });
});
