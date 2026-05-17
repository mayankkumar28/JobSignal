import { test, expect } from "@playwright/test";
import http from "http";
import { launchWithExtension } from "../helpers/extension-context.js";
import { startFixtureServer } from "../helpers/fixture-server.js";
import { waitForConfirmedBadge, getBadgeOnCard } from "../helpers/wait-for-badge.js";

let server: http.Server;
let PORT: number;

test.beforeAll(async () => {
  ({ server, port: PORT } = await startFixtureServer());
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("confirmed sponsor (Booking.com) shows green badge", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);

  const badge = await getBadgeOnCard(page, "001");
  expect(badge).toContain("Visa Sponsor");

  const el = page.locator('[data-job-id="001"] .dvs-badge--confirmed');
  await expect(el).toBeVisible();
  await expect(el).toHaveAttribute("title", /Recognized IND sponsor/);
  await context.close();
});

test("unknown company (FakeStartup Inc.) receives no badge", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`);
  await waitForConfirmedBadge(page); // wait for extension to finish processing

  const badgeCount = await page.locator('[data-job-id="004"] .dvs-badge').count();
  expect(badgeCount).toBe(0);
  await context.close();
});

test("ASML Holding N.V. matches ASML Netherlands B.V. via normalisation", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);

  const badge = await getBadgeOnCard(page, "005");
  expect(badge).toContain("Visa Sponsor");
  await context.close();
});

test("UBER matches Uber Netherlands B.V. — case-insensitive normalisation", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);

  const badge = await getBadgeOnCard(page, "003");
  expect(badge).toContain("Visa Sponsor");
  await context.close();
});

test("each matched card has exactly one badge (no duplicates)", async () => {
  const { context } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);
  await page.waitForTimeout(500); // let any extra scans settle

  const cards = await page.locator(".job-card-container").all();
  for (const card of cards) {
    const count = await card.locator(".dvs-badge").count();
    expect(count).toBeLessThanOrEqual(1);
  }
  await context.close();
});
