import { test, expect } from "@playwright/test";
import { launchWithExtension } from "../helpers/extension-context.js";

test("service worker activates and extension ID is captured", async () => {
  const { context, extensionId } = await launchWithExtension();
  expect(extensionId).toBeTruthy();
  expect(extensionId).toMatch(/^[a-z]{32}$/);
  expect(context.serviceWorkers().length).toBeGreaterThan(0);
  await context.close();
});

test("popup loads without errors", async () => {
  const { context, extensionId } = await launchWithExtension();
  const popup = await context.newPage();
  const errors: string[] = [];
  popup.on("pageerror", (e) => errors.push(e.message));

  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForTimeout(1000);

  expect(errors).toHaveLength(0);
  await expect(popup.locator("h1")).toContainText("JobSignal");
  await context.close();
});

test("dist-test manifest includes localhost in content_scripts matches", async () => {
  const { context } = await launchWithExtension();
  const [sw] = context.serviceWorkers();
  const extId = sw.url().split("/")[2];
  const manifest = await context.newPage().then(async (p) => {
    await p.goto(`chrome-extension://${extId}/manifest.json`);
    return p.evaluate(() => JSON.parse(document.body.innerText));
  });
  const matches: string[] = manifest.content_scripts?.[0]?.matches ?? [];
  expect(matches.some((m: string) => m.includes("localhost"))).toBe(true);
  await context.close();
});
