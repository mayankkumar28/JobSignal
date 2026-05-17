import { test, expect } from "@playwright/test";

const GUEST_URL =
  "https://www.linkedin.com/jobs/search?keywords=software+engineer&location=Netherlands";

test.describe("LinkedIn Guest DOM Contract", () => {
  test("guest page loads job cards without auth", async ({ page }) => {
    await page.goto(GUEST_URL, { waitUntil: "domcontentloaded" });

    const dismiss = page.locator(
      ".cta-modal__dismiss-btn, [data-tracking-control-name='public_jobs_dismiss-cta']",
    );
    if (await dismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismiss.click();
    }

    const cards = page.locator(".base-search-card");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
  });

  test("company names are extractable from .base-search-card__subtitle", async ({ page }) => {
    await page.goto(GUEST_URL, { waitUntil: "domcontentloaded" });

    const dismiss = page.locator(".cta-modal__dismiss-btn");
    if (await dismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismiss.click();
    }

    await page.waitForSelector(".base-search-card__subtitle", { timeout: 15_000 });
    const names = await page.locator(".base-search-card__subtitle").allTextContents();
    const nonEmpty = names.map((n) => n.trim()).filter(Boolean);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(5);
  });

  test("job title selector .base-search-card__title is present", async ({ page }) => {
    await page.goto(GUEST_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".base-search-card__title", { timeout: 15_000 });
    const titles = await page.locator(".base-search-card__title").allTextContents();
    expect(titles.filter((t) => t.trim().length > 0).length).toBeGreaterThanOrEqual(3);
  });
});
