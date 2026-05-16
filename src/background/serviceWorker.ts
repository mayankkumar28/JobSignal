import { fetchAndBuildCache } from "../shared/sponsorFetcher";
import { getSponsorCache, getStats, setSponsorCache, updateStats } from "../shared/storage";
import type { MessageType, SponsorCache } from "../shared/types";

const ALARM_NAME = "refresh-sponsors";
const ALARM_PERIOD_MINUTES = 43200; // 30 days

export async function fetchAndCacheSponsors(): Promise<SponsorCache> {
  const cache = await fetchAndBuildCache();
  await setSponsorCache(cache);
  await updateStats({ lastSyncTimestamp: cache.fetchedAt });
  return cache;
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

chrome.runtime.onInstalled.addListener(() => {
  handleInstall().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  handleAlarm(alarm).catch(console.error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  dispatchMessage(message as MessageType, sendResponse).catch(console.error);
  return true;
});
