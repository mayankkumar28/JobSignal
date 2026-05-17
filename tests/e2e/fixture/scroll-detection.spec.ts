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

test("new card injected after initial scan gets a badge via MutationObserver", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/jobs/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);

  const beforeCount = await page.locator(".dvs-badge").count();
  expect(beforeCount).toBeGreaterThan(0);

  // Inject a new Booking.com card via the fixture's helper function
  await page.evaluate(() => (window as unknown as { __injectScrollCards: () => void }).__injectScrollCards());

  // MutationObserver fires + debounce (200ms) + badge render
  await page.waitForSelector('[data-job-id="011"] .dvs-badge--confirmed', { timeout: 5000 });

  const afterCount = await page.locator(".dvs-badge").count();
  expect(afterCount).toBeGreaterThan(beforeCount);
  await context.close();
});

test("scroll event triggers rescan and badges appear on newly visible cards", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/jobs/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);

  const before = await page.locator(".dvs-badge").count();

  // Inject a card then simulate scroll to trigger the scroll handler
  await page.evaluate(() => (window as unknown as { __injectScrollCards: () => void }).__injectScrollCards());
  await page.evaluate(() => window.scrollBy(0, 100));

  await page.waitForSelector('[data-job-id="011"] .dvs-badge', { timeout: 5000 });
  expect(await page.locator(".dvs-badge").count()).toBeGreaterThan(before);
  await context.close();
});
