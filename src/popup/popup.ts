import { getSettings, setSettings } from "../shared/storage";
import type { ExtensionSettings, ExtensionStats, MessageType, SponsorCache } from "../shared/types";

export function formatDate(timestamp: number): string {
  if (timestamp === 0) return "Never";
  return new Date(timestamp).toLocaleDateString("en-NL", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function renderStats(stats: ExtensionStats): void {
  document.getElementById("companies-scanned")!.textContent =
    stats.companiesScanned.toString();
  document.getElementById("sponsors-found")!.textContent =
    stats.sponsorsFound.toString();
  document.getElementById("last-synced")!.textContent =
    formatDate(stats.lastSyncTimestamp);
}

export function renderSettings(settings: ExtensionSettings): void {
  document.querySelectorAll<HTMLButtonElement>(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("toggle-btn--active", btn.dataset.mode === settings.matchingMode);
  });
}

export async function loadStats(): Promise<void> {
  try {
    const stats = (await chrome.runtime.sendMessage(
      { type: "GET_STATS" } satisfies MessageType,
    )) as ExtensionStats | undefined;
    // stats is undefined when the service worker hasn't started yet;
    // leave the "—" placeholder values in the HTML rather than crashing.
    if (stats) renderStats(stats);
  } catch {
    // Service worker not responding — placeholder values remain visible
  }
}

export async function loadSettings(): Promise<void> {
  const settings = await getSettings();
  renderSettings(settings);
}

export async function handleRefresh(): Promise<void> {
  const refreshBtn = document.getElementById("refresh-btn") as HTMLButtonElement;
  const statusEl = document.getElementById("refresh-status") as HTMLElement;

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing…";
  statusEl.hidden = true;

  try {
    const cache = (await chrome.runtime.sendMessage(
      { type: "REFRESH_SPONSORS" } satisfies MessageType,
    )) as SponsorCache;
    document.getElementById("last-synced")!.textContent = formatDate(cache.fetchedAt);
    statusEl.textContent = `Updated — ${cache.sponsors.length.toLocaleString()} sponsors loaded`;
    statusEl.hidden = false;
  } catch {
    statusEl.textContent = "Refresh failed — try again";
    statusEl.hidden = false;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "🔄 Refresh Sponsor List";
  }
}

export async function handleModeToggle(mode: "strict" | "fuzzy"): Promise<void> {
  await setSettings({ matchingMode: mode });
  renderSettings({ matchingMode: mode });
}

document.addEventListener("DOMContentLoaded", () => {
  Promise.all([loadStats(), loadSettings()]).catch(console.error);

  document.getElementById("refresh-btn")!.addEventListener("click", () => {
    handleRefresh().catch(console.error);
  });

  document.querySelectorAll<HTMLButtonElement>(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode as "strict" | "fuzzy";
      handleModeToggle(mode).catch(console.error);
    });
  });
});
