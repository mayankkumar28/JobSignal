import type { Page } from "@playwright/test";

/** Waits for at least one badge to appear on the page. */
export async function waitForBadge(page: Page, timeout = 8000): Promise<void> {
  await page.waitForSelector(".dvs-badge", { timeout });
}

/** Waits for a confirmed (green) badge to appear on the page. */
export async function waitForConfirmedBadge(page: Page, timeout = 8000): Promise<void> {
  await page.waitForSelector(".dvs-badge--confirmed", { timeout });
}

/** Returns the badge element on a specific card, or null. */
export async function getBadgeOnCard(
  page: Page,
  jobId: string,
): Promise<string | null> {
  const badge = page.locator(`[data-job-id="${jobId}"] .dvs-badge`).first();
  const visible = await badge.isVisible().catch(() => false);
  return visible ? badge.textContent() : null;
}
