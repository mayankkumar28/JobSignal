import { CACHE_KEY, SETTINGS_KEY, STATS_KEY } from "./constants";
import type { ExtensionSettings, ExtensionStats, SponsorCache } from "./types";

const DEFAULT_STATS: ExtensionStats = {
  companiesScanned: 0,
  sponsorsFound: 0,
  lastSyncTimestamp: 0,
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  matchingMode: "fuzzy",
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

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
