import { test, expect } from "@playwright/test";
import http from "http";
import { launchWithExtension } from "../helpers/extension-context.js";
import { startFixtureServer } from "../helpers/fixture-server.js";
import { waitForConfirmedBadge } from "../helpers/wait-for-badge.js";

let server: http.Server;
let PORT: number;

test.beforeAll(async () => {
  ({ server, port: PORT } = await startFixtureServer());
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("rescanning a card that already has a badge does not add a second one", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/jobs/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);

  const card = page.locator('[data-job-id="001"]');
  const before = await card.locator(".dvs-badge").count();
  expect(before).toBe(1);

  // Trigger a DOM mutation on the card — MutationObserver fires and re-scans
  await page.evaluate(() => {
    document.querySelector('[data-job-id="001"]')?.appendChild(
      document.createTextNode(" "),
    );
  });

  // Wait longer than the debounce period (200ms) plus some render time
  await page.waitForTimeout(600);

  expect(await card.locator(".dvs-badge").count()).toBe(before);
  await context.close();
});

test("BADGE_ATTR on both li and inner div prevents any duplicate across both selector layers", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/jobs/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);
  await page.waitForTimeout(500);

  // Every job-card-container should have 0 or 1 badge — never 2+
  const containers = await page.locator(".job-card-container").all();
  for (const container of containers) {
    expect(await container.locator(".dvs-badge").count()).toBeLessThanOrEqual(1);
  }
  await context.close();
});
