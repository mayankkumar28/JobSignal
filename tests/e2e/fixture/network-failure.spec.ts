import { test, expect } from "@playwright/test";
import http from "http";
import { launchWithExtension } from "../helpers/extension-context.js";
import { startFixtureServer } from "../helpers/fixture-server.js";

let server: http.Server;
let PORT: number;

test.beforeAll(async () => {
  ({ server, port: PORT } = await startFixtureServer());
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("bundled snapshot is used when IND is unreachable — badges still appear", async () => {
  // Pass null to abort the IND route → service worker falls back to bundled snapshot
  const { context } = await launchWithExtension({ indResponseHtml: null });
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    throw new Error(`Page JS error: ${e.message}`);
  });

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`);

  // Bundled snapshot has 12k+ entries; Booking.com is a real IND sponsor
  const badge = await page.waitForSelector(".dvs-badge", { timeout: 10_000 });
  expect(badge).toBeTruthy();
  await context.close();
});

test("extension does not crash or throw JS errors when IND is unreachable", async () => {
  const errors: string[] = [];
  const { context } = await launchWithExtension({ indResponseHtml: null });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`);
  await page.waitForTimeout(5000);

  expect(errors).toHaveLength(0);
  await context.close();
});
