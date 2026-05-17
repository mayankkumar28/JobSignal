import { DEBOUNCE_MS } from "../shared/constants";

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

export function startObserver(callback: () => void): MutationObserver {
  const debouncedCallback = debounce(callback, DEBOUNCE_MS);

  const observer = new MutationObserver(debouncedCallback);
  // Observe body, not main: LinkedIn replaces <main> on SPA navigations, which
  // would detach an observer anchored on the old <main> element.
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", debouncedCallback);
  window.addEventListener("hashchange", debouncedCallback);

  return observer;
}
