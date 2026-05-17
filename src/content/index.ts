import { buildSponsorIndex, isRecognizedSponsor } from "../shared/sponsorMatcher";
import type { MessageType, SponsorCache } from "../shared/types";
import { renderBadge } from "./badgeRenderer";
import { startObserver } from "./domObserver";
import { scanVisibleJobs } from "./linkedinScanner";

const SCROLL_THROTTLE_MS = 500;
const CACHE_RETRY_DELAYS = [1500, 3000, 5000];

function isJobsPage(): boolean {
  return location.pathname.startsWith("/jobs");
}

async function getSponsorCacheWithRetry(): Promise<SponsorCache | null> {
  for (let attempt = 0; attempt <= CACHE_RETRY_DELAYS.length; attempt++) {
    if (!chrome.runtime?.id) return null;
    try {
      const cache = (await chrome.runtime.sendMessage(
        { type: "GET_SPONSORS" } satisfies MessageType,
      )) as SponsorCache | null;
      if (cache?.sponsors.length) return cache;
    } catch {
      // Service worker waking up or context gone — fall through to retry.
    }
    if (attempt < CACHE_RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, CACHE_RETRY_DELAYS[attempt]));
    }
  }
  return null;
}

let initialized = false;
// Lifted to module scope so SPA re-navigations can re-trigger a scan without
// re-running the full async init (cache fetch + index build).
let processBatch: (() => void) | null = null;

// Single rescan timer shared by all SPA-nav and pageload entry points so
// rapid pagination clicks don't queue up redundant scans.
const RESCAN_DELAY_MS = 600;
let rescanTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRescan(): void {
  if (rescanTimer !== null) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    processBatch?.();
  }, RESCAN_DELAY_MS);
}

export async function init(): Promise<void> {
  if (initialized) {
    // Already set up — just re-scan the freshly rendered DOM.
    scheduleRescan();
    return;
  }
  if (!chrome.runtime?.id) return;

  initialized = true;

  const cache = await getSponsorCacheWithRetry();

  if (!cache) {
    console.warn("[DVS] No sponsor cache — reload the tab if the extension was just installed");
    return;
  }

  const index = buildSponsorIndex(cache.sponsors);

  let totalScanned = 0;
  let totalFound = 0;

  processBatch = function (): void {
    const jobs = scanVisibleJobs();
    if (jobs.length === 0) return;

    let batchFound = 0;
    for (const job of jobs) {
      const result = isRecognizedSponsor(job.companyName, index);
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
  };

  processBatch();
  startObserver(processBatch);

  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTimer !== null) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        processBatch?.();
      }, SCROLL_THROTTLE_MS);
    },
    { passive: true },
  );
}

// Always intercept pushState — covers both entering /jobs from another page
// AND paginating within /jobs (page 2, 3, …) where LinkedIn uses pushState
// without a full reload and the URL stays under /jobs.
const origPush = history.pushState.bind(history);
history.pushState = function (...args: Parameters<typeof history.pushState>) {
  origPush(...args);
  if (isJobsPage()) init().catch(console.error);
};
window.addEventListener("popstate", () => {
  if (isJobsPage()) init().catch(console.error);
});

if (isJobsPage()) {
  init().catch(console.error);
}
