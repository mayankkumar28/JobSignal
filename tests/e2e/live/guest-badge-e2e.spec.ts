import { test, expect } from "@playwright/test";
import { launchWithExtension } from "../helpers/extension-context.js";

const GUEST_URL =
  "https://www.linkedin.com/jobs/search?keywords=software+engineer&location=Netherlands";

test.describe("Live LinkedIn — extension badge injection", () => {
  test("badges appear on real LinkedIn guest page", async () => {
    const { context } = await launchWithExtension();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(GUEST_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const dismiss = page.locator(
      ".cta-modal__dismiss-btn, [data-tracking-control-name='public_jobs_dismiss-cta']",
    );
    if (await dismiss.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dismiss.click();
    }

    // Wait for either a badge or the extension to finish processing
    const badge = await page.waitForSelector(".dvs-badge", { timeout: 20_000 }).catch(() => null);

    if (badge) {
      const text = await badge.textContent();
      expect(text).toContain("Visa Sponsor");

      // Badge must be appended inside an element that also carries the
      // company name — guards against a regression where the badge is
      // accidentally injected at page root or in an empty container.
      const parentText = await badge.evaluate(
        (el) => el.parentElement?.textContent?.trim() ?? "",
      );
      expect(parentText.length).toBeGreaterThan("Visa Sponsor".length + 1);
    } else {
      // Extension ran but no sponsors matched current listings — acceptable
      const processed = await page.locator("[data-dvs-checked]").count();
      expect(processed).toBeGreaterThan(0);
    }

    expect(errors).toHaveLength(0);
    await context.close();
  });

  test("extension does not crash on real LinkedIn", async () => {
    const { context } = await launchWithExtension();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(
      "https://www.linkedin.com/jobs/search?keywords=developer&location=Amsterdam",
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );

    await page.waitForTimeout(8000);
    expect(errors).toHaveLength(0);
    await context.close();
  });
});
