// scripts/diagnose-live.mjs
// Usage: npm run build && node scripts/diagnose-live.mjs

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, '../dist');

const report = {
  timestamp: new Date().toISOString(),
  target: 'LIVE LINKEDIN (guest, no auth)',
  extension: {},
  page: {},
  badges: {},
  popup: {},
  console: [],
  errors: [],
  warnings: [],
};

try {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });

  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 10000 });
  report.extension.serviceWorker = 'alive';
  report.extension.extensionId = sw.url().split('/')[2];

  sw.on('console', m => report.console.push(`[SW:${m.type()}] ${m.text()}`));

  const page = await context.newPage();
  page.on('console', m => report.console.push(`[PAGE:${m.type()}] ${m.text()}`));
  page.on('pageerror', e => report.errors.push(`[PAGE:ERROR] ${e.message}`));

  await page.goto(
    'https://www.linkedin.com/jobs/search?keywords=software+engineer&location=Netherlands',
    { waitUntil: 'domcontentloaded', timeout: 20000 }
  );

  const dismiss = page.locator('.cta-modal__dismiss-btn, [data-tracking-control-name="public_jobs_dismiss-cta"]');
  if (await dismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dismiss.click();
    report.page.loginWallDismissed = true;
  }

  report.page.url = page.url();
  report.page.title = await page.title();

  await page.waitForTimeout(8000);

  report.page.loggedInCards = await page.locator('.job-card-container').count();
  report.page.guestCards = await page.locator('.base-search-card, .base-card').count();
  report.page.totalCards = report.page.loggedInCards + report.page.guestCards;

  report.page.processedCards = await page.locator('[data-dvs-checked]').count();

  const loggedInNames = await page.locator('.job-card-container__primary-description').allTextContents();
  const guestNames = await page.locator('.base-search-card__subtitle').allTextContents();
  report.page.companyNames = [...loggedInNames, ...guestNames].map(s => s.trim()).filter(Boolean).slice(0, 20);

  report.page.domVariant = report.page.loggedInCards > 0 ? 'LOGGED_IN' : report.page.guestCards > 0 ? 'GUEST' : 'UNKNOWN';

  if (report.page.domVariant === 'GUEST' && report.page.processedCards === 0) {
    report.warnings.push(
      'Guest DOM detected but extension processed 0 cards. ' +
      'The extension likely only supports logged-in selectors. ' +
      'Apply the dual-DOM code change from the testing framework doc Section 6.'
    );
  }

  report.badges.confirmed = await page.locator('.dvs-badge--confirmed').count();
  report.badges.uncertain = await page.locator('.dvs-badge--uncertain').count();
  report.badges.total = report.badges.confirmed + report.badges.uncertain;
  report.badges.texts = await page.locator('.dvs-badge').allTextContents();

  await page.screenshot({ path: 'diagnose-live-screenshot.png', fullPage: false });
  report.screenshot = 'diagnose-live-screenshot.png';

  await context.close();
} catch (e) {
  report.errors.push(`FATAL: ${e.message}`);
  report.stack = e.stack;
}

report.verdict =
  report.errors.length > 0 ? 'FAIL — errors detected' :
  report.badges.total > 0 ? 'PASS — badges injected on live LinkedIn' :
  report.page.processedCards > 0 ? 'PARTIAL — extension ran but no sponsors matched' :
  report.page.totalCards > 0 ? 'WARN — cards found but extension did not process them' :
  'FAIL — no job cards found on page';

console.log('\n' + '='.repeat(70));
console.log('JOBSIGNAL LIVE DIAGNOSTIC REPORT');
console.log('='.repeat(70));
console.log(JSON.stringify(report, null, 2));
console.log('='.repeat(70));
