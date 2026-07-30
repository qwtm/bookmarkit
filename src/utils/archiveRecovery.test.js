import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SNAPSHOT_HOST,
  archiveRow,
  availabilityUrl,
  findSnapshot,
  readSnapshot,
  recoverable,
} from "./archiveRecovery.js";

const snapshotPayload = (closest) => ({ archived_snapshots: closest ? { closest } : {} });

const available = {
  available: true,
  url: `http://${SNAPSHOT_HOST}/web/20200101000000/https://gone.test/page`,
  timestamp: "20200101000000",
  status: "200",
};

describe("recoverable", () => {
  it("takes the broken links it is allowed to ask about", () => {
    const list = [
      { id: "1", url: "https://gone.test", urlStatus: "invalid" },
      { id: "2", url: "https://fine.test", urlStatus: "valid" },
      { id: "3", url: "http://localhost:3000/x", urlStatus: "invalid" },
      { id: "4", url: "https://old.test", unreachable: true },
    ];

    // An internal hostname is not something to hand a third party, so it is not
    // asked about even though it is broken.
    expect(recoverable(list).map((b) => b.id)).toEqual(["1", "4"]);
  });
});

describe("availabilityUrl", () => {
  it("asks one hard-coded host, with the bookmark only ever as a parameter", () => {
    expect(availabilityUrl("https://gone.test/a?b=c")).toBe(
      "https://archive.org/wayback/available?url=https%3A%2F%2Fgone.test%2Fa%3Fb%3Dc"
    );
  });
});

describe("readSnapshot", () => {
  it("reads a usable snapshot, as https", () => {
    expect(readSnapshot(snapshotPayload(available))).toEqual({
      url: `https://${SNAPSHOT_HOST}/web/20200101000000/https://gone.test/page`,
      timestamp: "20200101000000",
    });
  });

  it("treats no copy as nothing, which is the common case", () => {
    expect(readSnapshot(snapshotPayload(null))).toBeNull();
    expect(readSnapshot({})).toBeNull();
    expect(readSnapshot(undefined)).toBeNull();
  });

  it("refuses a snapshot the archive does not vouch for", () => {
    expect(readSnapshot(snapshotPayload({ ...available, available: false }))).toBeNull();
    expect(readSnapshot(snapshotPayload({ ...available, status: "404" }))).toBeNull();
  });

  it("refuses an address on any other host, however the answer dresses it up", () => {
    // The address is a remote server's claim, so a claim naming somewhere else is
    // dropped rather than written to a bookmark.
    for (const url of [
      "https://evil.test/web/2020/https://gone.test",
      "http://127.0.0.1:8080/web/2020/x",
      "javascript:alert(1)",
      "",
      42,
    ]) {
      expect(readSnapshot(snapshotPayload({ ...available, url }))).toBeNull();
    }
  });

  it("does not mind a missing timestamp", () => {
    const { timestamp: _dropped, ...rest } = available;
    expect(readSnapshot(snapshotPayload(rest)).timestamp).toBe("");
  });
});

describe("findSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = (impl) => {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("asks the archive and reads the answer", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(snapshotPayload(available)) })
    );

    const snapshot = await findSnapshot("https://gone.test/page");

    expect(snapshot.url).toContain(SNAPSHOT_HOST);
    expect(fetchMock.mock.calls[0][0]).toBe(availabilityUrl("https://gone.test/page"));
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
  });

  it("never asks about a URL the checks would not touch", async () => {
    const fetchMock = stubFetch(() => Promise.reject(new Error("should not be called")));

    expect(await findSnapshot("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(await findSnapshot("javascript:alert(1)")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers nothing when the lookup fails, rather than a message per dead link", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    expect(await findSnapshot("https://gone.test")).toBeNull();

    stubFetch(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
    expect(await findSnapshot("https://gone.test")).toBeNull();

    stubFetch(() => Promise.resolve({ ok: true, json: () => Promise.reject(new Error("html")) }));
    expect(await findSnapshot("https://gone.test")).toBeNull();
  });
});

describe("archiveRow", () => {
  const broken = {
    id: "1",
    title: "Gone",
    url: "https://gone.test/page",
    urlStatus: "invalid",
  };

  it("proposes the address and clears the verdict about the old one", () => {
    const row = archiveRow(broken, { url: "https://web.archive.org/web/2020/x", timestamp: "" });

    expect(row).toEqual({
      id: "1",
      title: "Gone",
      fields: ["url", "urlStatus"],
      before: { url: "https://gone.test/page", urlStatus: "invalid" },
      after: { url: "https://web.archive.org/web/2020/x", urlStatus: "idle" },
    });
  });

  it("clears the old boolean too, since nothing else would", () => {
    const row = archiveRow(
      { id: "1", title: "Gone", url: "https://gone.test", unreachable: true },
      { url: "https://web.archive.org/web/2020/x" }
    );

    expect(row.fields).toEqual(["url", "unreachable"]);
    expect(row.after.unreachable).toBe(false);
  });

  it("proposes nothing when there is nothing to propose", () => {
    expect(archiveRow(broken, null)).toBeNull();
    expect(archiveRow(broken, { url: broken.url })).toBeNull();
  });
});
