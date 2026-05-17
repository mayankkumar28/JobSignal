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

test("popup shows non-zero companies-scanned after extension processes fixture page", async () => {
  const { context, extensionId } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/jobs/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);
  // Allow UPDATE_STATS message to propagate to the service worker
  await page.waitForTimeout(1000);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForTimeout(500);

  const scanned = Number(await popup.locator("#companies-scanned").textContent());
  expect(scanned).toBeGreaterThan(0);
  await context.close();
});

test("popup shows non-zero sponsors-found after processing fixture page", async () => {
  const { context, extensionId } = await launchWithExtension();
  const page = await context.newPage();

  await page.goto(`http://localhost:${PORT}/jobs/linkedin-jobs.html`);
  await waitForConfirmedBadge(page);
  await page.waitForTimeout(1000);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForTimeout(500);

  const found = Number(await popup.locator("#sponsors-found").textContent());
  expect(found).toBeGreaterThan(0);
  await context.close();
});

test("mode toggle switches active button and persists on reload", async () => {
  const { context, extensionId } = await launchWithExtension();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForTimeout(500);

  // Click strict mode
  await popup.locator("#mode-strict").click();
  await expect(popup.locator("#mode-strict")).toHaveClass(/toggle-btn--active/);
  await expect(popup.locator("#mode-fuzzy")).not.toHaveClass(/toggle-btn--active/);

  // Reload popup — persisted setting should survive
  await popup.reload();
  await popup.waitForTimeout(500);
  await expect(popup.locator("#mode-strict")).toHaveClass(/toggle-btn--active/);
  await context.close();
});

test("last-synced shows a real date (not 'Never') after install", async () => {
  const { context, extensionId } = await launchWithExtension();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForTimeout(500);

  const synced = await popup.locator("#last-synced").textContent();
  expect(synced).not.toBe("Never");
  expect(synced).not.toBe("—");
  await context.close();
});
