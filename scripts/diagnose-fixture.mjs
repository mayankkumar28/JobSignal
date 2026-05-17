// scripts/diagnose-fixture.mjs
// Usage: npm run build:test && node scripts/diagnose-fixture.mjs
// Same as diagnose.mjs but reads from dist-test/ (localhost in content_scripts.matches)

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '../dist-test');
const FIXTURE_PATH = path.resolve(__dirname, '../tests/fixtures/pages');

const report = {
  timestamp: new Date().toISOString(),
  extension: {},
  page: {},
  badges: {},
  popup: {},
  console: [],
  errors: [],
  warnings: [],
};

const server = http.createServer((req, res) => {
  const file = path.join(FIXTURE_PATH, req.url === '/' ? 'linkedin-jobs.html' : req.url);
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

try {
  const distFiles = fs.existsSync(EXT_PATH) ? fs.readdirSync(EXT_PATH, { recursive: true }) : [];
  report.extension.distFiles = distFiles.filter(f =>
    f.endsWith('.js') || f.endsWith('.json') || f.endsWith('.html') || f.endsWith('.css')
  );

  if (!fs.existsSync(path.join(EXT_PATH, 'manifest.json'))) {
    report.errors.push('FATAL: dist-test/manifest.json not found. Did npm run build:test succeed?');
    throw new Error('No manifest');
  }

  report.extension.manifest = JSON.parse(fs.readFileSync(path.join(EXT_PATH, 'manifest.json'), 'utf8'));

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });

  // Mock the IND request BEFORE waiting for the service worker so the route is
  // in place when onInstalled fires and calls fetchAndBuildCache().
  await context.route('**/ind.nl/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<table>
        <tr><th scope="row">Booking.com B.V.</th></tr>
        <tr><th scope="row">Adyen N.V.</th></tr>
        <tr><th scope="row">ASML Netherlands B.V.</th></tr>
        <tr><th scope="row">Uber Netherlands B.V.</th></tr>
        <tr><th scope="row">ING Groep N.V.</th></tr>
        <tr><th scope="row">Shell International B.V.</th></tr>
        <tr><th scope="row">TomTom Global Content B.V.</th></tr>
        <tr><th scope="row">Philips Electronics Nederland B.V.</th></tr>
      </table>`,
    })
  );

  let sw;
  try {
    sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 10000 });
    report.extension.serviceWorker = 'alive';
    report.extension.extensionId = sw.url().split('/')[2];
  } catch {
    report.extension.serviceWorker = 'FAILED TO START';
    report.errors.push('Service worker did not activate within 10s');
  }

  if (sw) {
    sw.on('console', m => report.console.push(`[SW:${m.type()}] ${m.text()}`));
    sw.on('close', () => report.warnings.push('Service worker terminated during test'));
    // Give onInstalled handler time to fetch + cache sponsors before the content script asks for them
    await new Promise(r => setTimeout(r, 2000));
  }

  const page = await context.newPage();
  page.on('console', m => report.console.push(`[PAGE:${m.type()}] ${m.text()}`));
  page.on('pageerror', e => report.errors.push(`[PAGE:ERROR] ${e.message}`));

  await page.goto(`http://localhost:${PORT}/linkedin-jobs.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
  });

  report.page.url = page.url();
  report.page.title = await page.title();

  await page.waitForTimeout(5000);

  report.page.jobCards = await page.locator(
    '.job-card-container, .base-search-card, .base-card'
  ).count();

  report.page.processedCards = await page.locator('[data-dvs-checked]').count();

  report.page.companyNames = await page.locator(
    '.job-card-container__primary-description, .base-search-card__subtitle'
  ).allTextContents().then(arr => arr.map(s => s.trim()).filter(Boolean));

  report.badges.confirmed = await page.locator('.dvs-badge--confirmed').count();
  report.badges.uncertain = await page.locator('.dvs-badge--uncertain').count();
  report.badges.total = report.badges.confirmed + report.badges.uncertain;
  report.badges.texts = await page.locator('.dvs-badge').allTextContents();

  const cards = await page.locator('.job-card-container').all();
  for (const card of cards) {
    const count = await card.locator('.dvs-badge').count();
    if (count > 1) {
      const id = await card.getAttribute('data-job-id');
      report.warnings.push(`Duplicate badge on card ${id}: ${count} badges`);
    }
  }

  if (report.extension.extensionId) {
    try {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${report.extension.extensionId}/popup/popup.html`);
      await popup.waitForTimeout(1000);
      report.popup.html = await popup.locator('body').innerHTML();
      report.popup.loaded = true;
      await popup.close();
    } catch (e) {
      report.popup.loaded = false;
      report.errors.push(`Popup failed: ${e.message}`);
    }
  }

  await page.screenshot({ path: 'diagnose-fixture-screenshot.png', fullPage: false });
  report.screenshot = 'diagnose-fixture-screenshot.png';

  await context.close();
} catch (e) {
  if (!report.errors.some(err => err.startsWith('FATAL'))) {
    report.errors.push(`FATAL: ${e.message}`);
  }
  report.stack = e.stack;
} finally {
  server.close();
}

report.verdict = report.errors.length === 0 && report.badges.total > 0
  ? 'PASS — extension loaded, badges injected'
  : report.errors.length === 0 && report.badges.total === 0
    ? 'WARN — extension loaded but no badges appeared'
    : 'FAIL — errors detected';

console.log('\n' + '='.repeat(70));
console.log('JOBSIGNAL FIXTURE DIAGNOSTIC REPORT');
console.log('='.repeat(70));
console.log(JSON.stringify(report, null, 2));
console.log('='.repeat(70));
