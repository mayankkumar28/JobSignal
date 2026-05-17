import { CACHE_MAX_AGE_MS, CACHE_KEY, STATS_KEY } from "./constants";
import type { ExtensionStats, SponsorCache } from "./types";

const DEFAULT_STATS: ExtensionStats = {
  companiesScanned: 0,
  sponsorsFound: 0,
  lastSyncTimestamp: 0,
};

export async function getSponsorCache(): Promise<SponsorCache | null> {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return (result[CACHE_KEY] as SponsorCache) ?? null;
}

export async function setSponsorCache(cache: SponsorCache): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function getStats(): Promise<ExtensionStats> {
  const result = await chrome.storage.local.get(STATS_KEY);
  const stored = result[STATS_KEY] as Partial<ExtensionStats> | undefined;
  return { ...DEFAULT_STATS, ...(stored ?? {}) };
}

export async function updateStats(partial: Partial<ExtensionStats>): Promise<void> {
  const current = await getStats();
  await chrome.storage.local.set({ [STATS_KEY]: { ...current, ...partial } });
}

export function isCacheStale(cache: SponsorCache): boolean {
  return Date.now() - cache.fetchedAt > CACHE_MAX_AGE_MS;
}
