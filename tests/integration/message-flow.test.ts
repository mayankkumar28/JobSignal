import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MessageType, SponsorCache } from "../../src/shared/types";

let store: Record<string, unknown> = {};

const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  }),
};

vi.stubGlobal("chrome", {
  storage: { local: mockStorage },
  alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
  },
});

// Import after stubbing chrome so module-level listener registrations don't crash
const { dispatchMessage } = await import("../../src/background/serviceWorker");
const { setSponsorCache } = await import("../../src/shared/storage");
const { buildSponsorCache } = await import("../../src/shared/sponsorFetcher");

function handleMessage(message: MessageType): Promise<unknown> {
  return new Promise((resolve) => {
    dispatchMessage(message, resolve).catch(console.error);
  });
}

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
  mockStorage.get.mockImplementation(async (key: string) => ({ [key]: store[key] }));
  mockStorage.set.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  });
});

describe("GET_SPONSORS message", () => {
  it("returns null when the cache is empty", async () => {
    const result = await handleMessage({ type: "GET_SPONSORS" });
    expect(result).toBeNull();
  });

  it("returns the stored sponsor cache", async () => {
    const cache = buildSponsorCache(["Booking.com B.V.", "Adyen N.V."]);
    await setSponsorCache(cache);
    const result = (await handleMessage({ type: "GET_SPONSORS" })) as SponsorCache;
    expect(result.sponsors).toHaveLength(2);
  });

  it("returns sponsors with correct normalised names", async () => {
    await setSponsorCache(buildSponsorCache(["Uber Netherlands B.V."]));
    const result = (await handleMessage({ type: "GET_SPONSORS" })) as SponsorCache;
    expect(result.sponsors[0].normalizedName).toBe("uber");
  });
});

describe("GET_STATS message", () => {
  it("returns all-zero stats when nothing has been stored", async () => {
    const result = await handleMessage({ type: "GET_STATS" });
    expect(result).toMatchObject({
      companiesScanned: 0,
      sponsorsFound: 0,
      lastSyncTimestamp: 0,
    });
  });
});

describe("UPDATE_STATS message", () => {
  it("persists scanned and found counts", async () => {
    await handleMessage({
      type: "UPDATE_STATS",
      payload: { companiesScanned: 25, sponsorsFound: 8 },
    });
    const stats = (await handleMessage({ type: "GET_STATS" })) as { companiesScanned: number; sponsorsFound: number };
    expect(stats.companiesScanned).toBe(25);
    expect(stats.sponsorsFound).toBe(8);
  });

  it("merges partial updates — does not overwrite unrelated fields", async () => {
    await handleMessage({ type: "UPDATE_STATS", payload: { companiesScanned: 10 } });
    await handleMessage({ type: "UPDATE_STATS", payload: { sponsorsFound: 3 } });
    const stats = (await handleMessage({ type: "GET_STATS" })) as { companiesScanned: number; sponsorsFound: number };
    expect(stats.companiesScanned).toBe(10);
    expect(stats.sponsorsFound).toBe(3);
  });
});

describe("REFRESH_SPONSORS message", () => {
  it("falls back to bundled snapshot when IND fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    const result = (await handleMessage({ type: "REFRESH_SPONSORS" })) as SponsorCache;
    // Bundled snapshot has thousands of entries
    expect(result.sponsors.length).toBeGreaterThan(100);
  });

  it("stores the refreshed cache so GET_SPONSORS returns it", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    await handleMessage({ type: "REFRESH_SPONSORS" });
    const result = (await handleMessage({ type: "GET_SPONSORS" })) as SponsorCache;
    expect(result.sponsors.length).toBeGreaterThan(100);
  });
});
