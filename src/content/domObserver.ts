import { DEBOUNCE_MS } from "../shared/constants";

// Selectors that indicate a mutation introduced (or removed) something that
// might be a job card. LinkedIn's body subtree is mutated by many unrelated
// modules (chat, notifications, ads) — without this filter, every keystroke
// in chat triggers a rescan.
const JOB_HINT_SEL =
  '.base-search-card, .base-card, a[href*="/jobs/view/"], img[src*="company-logo"]';

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

function mutationsTouchJobs(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(JOB_HINT_SEL) || node.querySelector(JOB_HINT_SEL)) {
        return true;
      }
    }
  }
  return false;
}

export function startObserver(callback: () => void): MutationObserver {
  const debouncedCallback = debounce(callback, DEBOUNCE_MS);

  // Observe body, not main: LinkedIn replaces <main> on SPA navigations, which
  // would detach an observer anchored on the old <main> element.
  const observer = new MutationObserver((mutations) => {
    if (mutationsTouchJobs(mutations)) debouncedCallback();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", debouncedCallback);
  window.addEventListener("hashchange", debouncedCallback);

  return observer;
}
