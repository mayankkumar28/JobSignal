import { vi, describe, it, expect, beforeEach } from "vitest";

// Hoist mocks before any imports so serviceWorker.ts sees them when it loads
vi.mock("../src/shared/sponsorFetcher", () => ({
  fetchAndBuildCache: vi.fn(),
}));
vi.mock("../src/shared/storage", () => ({
  getSponsorCache: vi.fn(),
  setSponsorCache: vi.fn(),
  getStats: vi.fn(),
  updateStats: vi.fn(),
  isCacheStale: vi.fn(),
}));

import { fetchAndBuildCache } from "../src/shared/sponsorFetcher";
import { getSponsorCache, setSponsorCache, getStats, updateStats, isCacheStale } from "../src/shared/storage";
import {
  fetchAndCacheSponsors,
  handleInstall,
  handleAlarm,
  handleStartup,
  dispatchMessage,
} from "../src/background/serviceWorker";
import type { SponsorCache, ExtensionStats } from "../src/shared/types";

const mockCache: SponsorCache = {
  sponsors: [{ originalName: "Adyen N.V.", normalizedName: "adyen", tokens: ["adyen"] }],
  fetchedAt: 1_000_000,
  version: "1.0",
};

const mockStats: ExtensionStats = { companiesScanned: 10, sponsorsFound: 3, lastSyncTimestamp: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAndBuildCache).mockResolvedValue(mockCache);
  vi.mocked(setSponsorCache).mockResolvedValue(undefined);
  vi.mocked(updateStats).mockResolvedValue(undefined);
  vi.mocked(getSponsorCache).mockResolvedValue(mockCache);
  vi.mocked(getStats).mockResolvedValue(mockStats);
  vi.mocked(isCacheStale).mockReturnValue(false);
});

// ── fetchAndCacheSponsors ────────────────────────────────────────────────────

describe("fetchAndCacheSponsors", () => {
  it("calls fetchAndBuildCache, stores the result, and updates lastSyncTimestamp", async () => {
    const result = await fetchAndCacheSponsors();

    expect(fetchAndBuildCache).toHaveBeenCalledOnce();
    expect(setSponsorCache).toHaveBeenCalledWith(mockCache);
    expect(updateStats).toHaveBeenCalledWith({ lastSyncTimestamp: mockCache.fetchedAt });
    expect(result).toBe(mockCache);
  });
});

// ── handleInstall ────────────────────────────────────────────────────────────

describe("handleInstall", () => {
  it("fetches and caches sponsors on install", async () => {
    await handleInstall();
    expect(fetchAndBuildCache).toHaveBeenCalledOnce();
    expect(setSponsorCache).toHaveBeenCalledWith(mockCache);
  });

  it("creates the refresh alarm with 30-day period", async () => {
    await handleInstall();
    expect(chrome.alarms.create).toHaveBeenCalledWith("refresh-sponsors", {
      periodInMinutes: 43200,
    });
  });
});

// ── handleStartup ────────────────────────────────────────────────────────────

describe("handleStartup", () => {
  it("refreshes sponsors when cache is stale", async () => {
    vi.mocked(isCacheStale).mockReturnValue(true);
    await handleStartup();
    expect(fetchAndBuildCache).toHaveBeenCalledOnce();
  });

  it("refreshes sponsors when no cache exists", async () => {
    vi.mocked(getSponsorCache).mockResolvedValue(null);
    await handleStartup();
    expect(fetchAndBuildCache).toHaveBeenCalledOnce();
  });

  it("skips refresh when cache is fresh", async () => {
    vi.mocked(isCacheStale).mockReturnValue(false);
    await handleStartup();
    expect(fetchAndBuildCache).not.toHaveBeenCalled();
  });
});

// ── handleAlarm ──────────────────────────────────────────────────────────────

describe("handleAlarm", () => {
  it("refreshes sponsors when alarm name matches", async () => {
    await handleAlarm({ name: "refresh-sponsors", scheduledTime: Date.now() });
    expect(fetchAndBuildCache).toHaveBeenCalledOnce();
  });

  it("ignores alarms with a different name", async () => {
    await handleAlarm({ name: "some-other-alarm", scheduledTime: Date.now() });
    expect(fetchAndBuildCache).not.toHaveBeenCalled();
  });
});

// ── dispatchMessage ──────────────────────────────────────────────────────────

describe("dispatchMessage — GET_SPONSORS", () => {
  it("sends the current sponsor cache", async () => {
    const sendResponse = vi.fn();
    await dispatchMessage({ type: "GET_SPONSORS" }, sendResponse);
    expect(getSponsorCache).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith(mockCache);
  });

  it("sends null when no cache exists", async () => {
    vi.mocked(getSponsorCache).mockResolvedValue(null);
    const sendResponse = vi.fn();
    await dispatchMessage({ type: "GET_SPONSORS" }, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(null);
  });
});

describe("dispatchMessage — REFRESH_SPONSORS", () => {
  it("re-fetches and sends the updated cache", async () => {
    const sendResponse = vi.fn();
    await dispatchMessage({ type: "REFRESH_SPONSORS" }, sendResponse);
    expect(fetchAndBuildCache).toHaveBeenCalledOnce();
    expect(setSponsorCache).toHaveBeenCalledWith(mockCache);
    expect(sendResponse).toHaveBeenCalledWith(mockCache);
  });
});

describe("dispatchMessage — GET_STATS", () => {
  it("sends the current extension stats", async () => {
    const sendResponse = vi.fn();
    await dispatchMessage({ type: "GET_STATS" }, sendResponse);
    expect(getStats).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith(mockStats);
  });
});

describe("dispatchMessage — UPDATE_STATS", () => {
  it("merges the partial stats and sends null", async () => {
    const sendResponse = vi.fn();
    const payload = { sponsorsFound: 7 };
    await dispatchMessage({ type: "UPDATE_STATS", payload }, sendResponse);
    expect(updateStats).toHaveBeenCalledWith(payload);
    expect(sendResponse).toHaveBeenCalledWith(null);
  });
});
