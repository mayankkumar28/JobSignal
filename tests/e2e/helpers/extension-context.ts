import { type BrowserContext, chromium } from "@playwright/test";
import path from "path";

const EXTENSION_PATH = path.resolve(process.cwd(), "dist-test");

const IND_MOCK_HTML = `<table>
  <tr><th scope="row">Booking.com B.V.</th></tr>
  <tr><th scope="row">Adyen N.V.</th></tr>
  <tr><th scope="row">ASML Netherlands B.V.</th></tr>
  <tr><th scope="row">Uber Netherlands B.V.</th></tr>
  <tr><th scope="row">ING Groep N.V.</th></tr>
  <tr><th scope="row">Shell International B.V.</th></tr>
  <tr><th scope="row">TomTom Global Content B.V.</th></tr>
  <tr><th scope="row">Philips Electronics Nederland B.V.</th></tr>
</table>`;

export interface LaunchOptions {
  /** Custom HTML for the IND register response.
   *  Defaults to a small test set covering the fixture page companies.
   *  Pass null to abort the IND request (forces bundled snapshot fallback). */
  indResponseHtml?: string | null;
}

export async function launchWithExtension(options: LaunchOptions = {}): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
  });

  // Route must be in place BEFORE onInstalled fires so the cache builds quickly.
  const indHtml = options.indResponseHtml === undefined ? IND_MOCK_HTML : options.indResponseHtml;
  if (indHtml !== null) {
    await context.route("**/ind.nl/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: indHtml }),
    );
  } else {
    // Abort → service worker falls back to bundled snapshot (12 k entries)
    await context.route("**/ind.nl/**", (route) => route.abort());
  }

  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  const extensionId = serviceWorker.url().split("/")[2];

  // Give onInstalled handler time to complete before the test navigates
  await new Promise((r) => setTimeout(r, 2000));

  return { context, extensionId };
}
