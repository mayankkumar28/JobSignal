import { fetchAndBuildCache } from "../shared/sponsorFetcher";
import { getSponsorCache, getStats, isCacheStale, setSponsorCache, updateStats } from "../shared/storage";
import type { MessageType, SponsorCache } from "../shared/types";

const ALARM_NAME = "refresh-sponsors";
const ALARM_PERIOD_MINUTES = 43200; // 30 days

// If a refresh returns dramatically fewer sponsors than we previously had cached,
// something has gone wrong upstream (IND page restructure, partial response,
// compromise). Keep the previous cache rather than persisting the suspicious one.
const SHRINK_REJECT_RATIO = 0.5;

export async function fetchAndCacheSponsors(): Promise<SponsorCache> {
  const previous = await getSponsorCache();
  const fresh = await fetchAndBuildCache();
  if (
    previous &&
    fresh.sponsors.length < previous.sponsors.length * SHRINK_REJECT_RATIO
  ) {
    console.warn(
      `[DVS] Rejecting fresh sponsor list: ${fresh.sponsors.length} entries vs ${previous.sponsors.length} cached — keeping previous cache`,
    );
    return previous;
  }
  await setSponsorCache(fresh);
  await updateStats({ lastSyncTimestamp: fresh.fetchedAt });
  return fresh;
}

export async function handleInstall(): Promise<void> {
  await fetchAndCacheSponsors();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name === ALARM_NAME) {
    await fetchAndCacheSponsors();
  }
}

export async function dispatchMessage(
  message: MessageType,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  switch (message.type) {
    case "GET_SPONSORS":
      sendResponse(await getSponsorCache());
      break;
    case "REFRESH_SPONSORS":
      sendResponse(await fetchAndCacheSponsors());
      break;
    case "GET_STATS":
      sendResponse(await getStats());
      break;
    case "UPDATE_STATS":
      await updateStats(message.payload);
      sendResponse(null);
      break;
  }
}

export async function handleStartup(): Promise<void> {
  const cache = await getSponsorCache();
  if (!cache || isCacheStale(cache)) {
    await fetchAndCacheSponsors();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  handleInstall().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  handleStartup().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  handleAlarm(alarm).catch(console.error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  dispatchMessage(message as MessageType, sendResponse).catch(console.error);
  return true;
});
