import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSponsorCache, setSponsorCache, isCacheStale } from "../../src/shared/storage";
import { buildSponsorCache } from "../../src/shared/sponsorFetcher";
import { CACHE_MAX_AGE_MS } from "../../src/shared/constants";
import type { SponsorCache } from "../../src/shared/types";

let store: Record<string, unknown> = {};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      }),
    },
  },
  alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
  },
});

beforeEach(() => {
  store = {};
});

describe("cache round-trip through storage", () => {
  it("returns null when no cache has been stored", async () => {
    expect(await getSponsorCache()).toBeNull();
  });

  it("stores and retrieves a SponsorCache", async () => {
    const cache = buildSponsorCache(["Booking.com B.V.", "Adyen N.V."]);
    await setSponsorCache(cache);
    const retrieved = await getSponsorCache();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sponsors).toHaveLength(2);
  });

  it("normalised names are persisted correctly", async () => {
    const cache = buildSponsorCache(["Booking.com B.V."]);
    await setSponsorCache(cache);
    const retrieved = await getSponsorCache();
    expect(retrieved!.sponsors[0].normalizedName).toBe("booking com");
  });

  it("tokens are persisted alongside normalised names", async () => {
    const cache = buildSponsorCache(["ASML Netherlands B.V."]);
    await setSponsorCache(cache);
    const retrieved = await getSponsorCache();
    expect(retrieved!.sponsors[0].tokens).toContain("asml");
  });

  it("overwrites an existing cache", async () => {
    await setSponsorCache(buildSponsorCache(["Adyen N.V."]));
    await setSponsorCache(buildSponsorCache(["Booking.com B.V.", "Shell International B.V."]));
    const retrieved = await getSponsorCache();
    expect(retrieved!.sponsors).toHaveLength(2);
  });
});

describe("isCacheStale", () => {
  it("fresh cache (just fetched) is not stale", () => {
    const cache: SponsorCache = {
      sponsors: [],
      fetchedAt: Date.now(),
      version: "1.0",
    };
    expect(isCacheStale(cache)).toBe(false);
  });

  it("cache older than CACHE_MAX_AGE_MS is stale", () => {
    const cache: SponsorCache = {
      sponsors: [],
      fetchedAt: Date.now() - CACHE_MAX_AGE_MS - 1000,
      version: "1.0",
    };
    expect(isCacheStale(cache)).toBe(true);
  });

  it("cache at exactly CACHE_MAX_AGE_MS boundary is not yet stale", () => {
    const cache: SponsorCache = {
      sponsors: [],
      fetchedAt: Date.now() - CACHE_MAX_AGE_MS + 5000,
      version: "1.0",
    };
    expect(isCacheStale(cache)).toBe(false);
  });

  it("fetchedAt=0 (never synced) is always stale", () => {
    const cache: SponsorCache = { sponsors: [], fetchedAt: 0, version: "1.0" };
    expect(isCacheStale(cache)).toBe(true);
  });
});
