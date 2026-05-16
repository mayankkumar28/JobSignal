import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSponsorCache,
  setSponsorCache,
  getStats,
  updateStats,
  getSettings,
  setSettings,
} from "../src/shared/storage";
import { CACHE_KEY, SETTINGS_KEY, STATS_KEY } from "../src/shared/constants";
import type { SponsorCache, ExtensionStats, ExtensionSettings } from "../src/shared/types";

// ── Chrome storage mock ──────────────────────────────────────────────────────

let store: Record<string, unknown> = {};

const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, items); }),
};

vi.stubGlobal("chrome", { storage: { local: mockStorage } });

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

// ── getSponsorCache / setSponsorCache ────────────────────────────────────────

describe("getSponsorCache", () => {
  it("returns null when nothing is stored", async () => {
    expect(await getSponsorCache()).toBeNull();
  });

  it("returns the stored cache", async () => {
    const cache: SponsorCache = {
      sponsors: [{ originalName: "Adyen N.V.", normalizedName: "adyen", tokens: ["adyen"] }],
      fetchedAt: 1_000_000,
      version: "1.0",
    };
    store[CACHE_KEY] = cache;
    expect(await getSponsorCache()).toEqual(cache);
  });
});

describe("setSponsorCache", () => {
  it("writes the cache under CACHE_KEY", async () => {
    const cache: SponsorCache = {
      sponsors: [],
      fetchedAt: 2_000_000,
      version: "1.0",
    };
    await setSponsorCache(cache);
    expect(store[CACHE_KEY]).toEqual(cache);
  });

  it("round-trips through get after set", async () => {
    const cache: SponsorCache = {
      sponsors: [{ originalName: "ASML Holding N.V.", normalizedName: "asml", tokens: ["asml"] }],
      fetchedAt: 3_000_000,
      version: "1.0",
    };
    await setSponsorCache(cache);
    expect(await getSponsorCache()).toEqual(cache);
  });
});

// ── getStats / updateStats ───────────────────────────────────────────────────

describe("getStats", () => {
  it("returns all-zero defaults when nothing is stored", async () => {
    expect(await getStats()).toEqual({
      companiesScanned: 0,
      sponsorsFound: 0,
      lastSyncTimestamp: 0,
    });
  });

  it("returns the stored stats", async () => {
    const stats: ExtensionStats = { companiesScanned: 50, sponsorsFound: 10, lastSyncTimestamp: 123 };
    store[STATS_KEY] = stats;
    expect(await getStats()).toEqual(stats);
  });

  it("merges stored partial stats with defaults", async () => {
    store[STATS_KEY] = { companiesScanned: 7 };
    const stats = await getStats();
    expect(stats.companiesScanned).toBe(7);
    expect(stats.sponsorsFound).toBe(0);
    expect(stats.lastSyncTimestamp).toBe(0);
  });
});

describe("updateStats", () => {
  it("merges partial update into existing stats", async () => {
    store[STATS_KEY] = { companiesScanned: 10, sponsorsFound: 3, lastSyncTimestamp: 0 };
    await updateStats({ sponsorsFound: 5 });
    const updated = store[STATS_KEY] as ExtensionStats;
    expect(updated.companiesScanned).toBe(10);
    expect(updated.sponsorsFound).toBe(5);
  });

  it("works from a cold start (no prior stats stored)", async () => {
    await updateStats({ companiesScanned: 42 });
    const stored = store[STATS_KEY] as ExtensionStats;
    expect(stored.companiesScanned).toBe(42);
    expect(stored.sponsorsFound).toBe(0);
    expect(stored.lastSyncTimestamp).toBe(0);
  });

  it("updates lastSyncTimestamp", async () => {
    const ts = Date.now();
    await updateStats({ lastSyncTimestamp: ts });
    expect((store[STATS_KEY] as ExtensionStats).lastSyncTimestamp).toBe(ts);
  });
});

// ── getSettings / setSettings ────────────────────────────────────────────────

describe("getSettings", () => {
  it("returns fuzzy as the default matchingMode", async () => {
    const settings = await getSettings();
    expect(settings.matchingMode).toBe("fuzzy");
  });

  it("returns stored settings", async () => {
    const s: ExtensionSettings = { matchingMode: "strict" };
    store[SETTINGS_KEY] = s;
    expect(await getSettings()).toEqual(s);
  });
});

describe("setSettings", () => {
  it("persists settings under SETTINGS_KEY", async () => {
    await setSettings({ matchingMode: "strict" });
    expect(store[SETTINGS_KEY]).toEqual({ matchingMode: "strict" });
  });

  it("round-trips through get after set", async () => {
    await setSettings({ matchingMode: "strict" });
    expect(await getSettings()).toEqual({ matchingMode: "strict" });
  });

  it("overwrites previous settings", async () => {
    await setSettings({ matchingMode: "strict" });
    await setSettings({ matchingMode: "fuzzy" });
    expect((store[SETTINGS_KEY] as ExtensionSettings).matchingMode).toBe("fuzzy");
  });
});
