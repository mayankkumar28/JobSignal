import { buildSponsorIndex, isRecognizedSponsor } from "../shared/sponsorMatcher";
import { getSettings } from "../shared/storage";
import type { MessageType, SponsorCache } from "../shared/types";
import { renderBadge } from "./badgeRenderer";
import { startObserver } from "./domObserver";
import { scanVisibleJobs } from "./linkedinScanner";

const SCROLL_THROTTLE_MS = 500;

export async function init(): Promise<void> {
  // Guard: chrome.runtime.id is undefined when the extension context has been
  // invalidated (e.g. extension reloaded while this tab was already open).
  // Without this check, sendMessage throws and Chrome logs
  // "GET chrome-extension://invalid/ net::ERR_FAILED" in the console.
  if (!chrome.runtime?.id) return;

  let cache: SponsorCache | null = null;
  try {
    cache = (await chrome.runtime.sendMessage(
      { type: "GET_SPONSORS" } satisfies MessageType,
    )) as SponsorCache | null;
  } catch {
    // Service worker not yet registered (first install race) or context gone
    return;
  }

  if (!cache || cache.sponsors.length === 0) {
    console.warn("[DVS] No sponsor cache available — skipping badge injection");
    return;
  }

  const settings = await getSettings();
  const index = buildSponsorIndex(cache.sponsors);

  let totalScanned = 0;
  let totalFound = 0;

  function processBatch(): void {
    const jobs = scanVisibleJobs();
    if (jobs.length === 0) return;

    let batchFound = 0;
    for (const job of jobs) {
      const result = isRecognizedSponsor(job.companyName, index, settings.matchingMode);
      renderBadge(job, result);
      if (result.matched) batchFound++;
    }

    totalScanned += jobs.length;
    totalFound += batchFound;

    // Best-effort stat update — the service worker may be sleeping between events
    chrome.runtime
      .sendMessage({
        type: "UPDATE_STATS",
        payload: { companiesScanned: totalScanned, sponsorsFound: totalFound },
      } satisfies MessageType)
      .catch(() => {});
  }

  processBatch();
  startObserver(processBatch);

  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTimer !== null) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        processBatch();
      }, SCROLL_THROTTLE_MS);
    },
    { passive: true },
  );
}

init().catch(console.error);
