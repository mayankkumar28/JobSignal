/**
 * discover-selectors.mjs
 *
 * Launches real Chromium, navigates to LinkedIn (guest page by default,
 * or logged-in if auth state is saved), and reports which CSS selectors
 * currently match job cards and company names.
 *
 * Usage:
 *   node scripts/discover-selectors.mjs              # guest page
 *   node scripts/discover-selectors.mjs --logged-in  # uses saved auth (run save-auth.mjs first)
 */

import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const AUTH_FILE = path.resolve("scripts/.auth-state.json");
const useAuth = process.argv.includes("--logged-in");

const GUEST_URL =
  "https://www.linkedin.com/jobs/search?keywords=software+engineer&location=Netherlands";
const LOGGED_IN_URL =
  "https://www.linkedin.com/jobs/search/?keywords=software+engineer&location=Netherlands&f_TPR=r86400";

// ── Candidate selectors to probe ──────────────────────────────────────────────

const CARD_CANDIDATES = [
  // Current in constants.ts
  ".job-card-container",
  ".jobs-search-results__list-item",
  ".base-search-card",
  ".base-card",
  // Guest page
  ".job-search-card",
  // Logged-in two-pane layout
  ".jobs-search-two-pane__job-card-container-wrapper",
  "li[data-occludable-job-id]",
  "[data-view-name='job-card']",
  "[data-entity-urn]",
  // Scaffold layout (logged-in SPA)
  "li.scaffold-layout__list-item",
  ".scaffold-layout__list-item",
  "li[data-item-index]",
  // Older logged-in
  ".job-card-list",
  ".job-card-square",
  "li.ember-view",
  // Data attribute fallbacks (stable across redesigns)
  "[data-job-id]",
  "[data-occludable-update-id]",
];

const COMPANY_CANDIDATES = [
  // Current in constants.ts
  ".job-card-container__primary-description",
  ".artdeco-entity-lockup__subtitle",
  ".base-search-card__subtitle",
  // Guest page (confirmed working)
  "h4.base-search-card__subtitle",
  // Logged-in alternatives
  ".job-card-container__company-name",
  ".job-search-card__subtitle",
  ".jobs-unified-top-card__company-name",
  ".job-card-list__primary-description",
  "[data-tracking-control-name*='company']",
  "[data-tracking-control-name='public_jobs_jserp-result_job-search-card-subtitle']",
  ".topcard__org-name-link",
  // Artdeco components (logged-in)
  ".artdeco-entity-lockup__subtitle span",
  ".job-card-container__company-name a",
];

// ─────────────────────────────────────────────────────────────────────────────

if (useAuth && !fs.existsSync(AUTH_FILE)) {
  console.error("No auth state found. Run: node scripts/save-auth.mjs first.");
  process.exit(1);
}

const contextOptions = useAuth
  ? { storageState: AUTH_FILE }
  : {};

const context = await chromium.launchPersistentContext("", {
  headless: false,
  ...contextOptions,
  args: ["--no-first-run", "--disable-default-apps"],
});

const page = await context.newPage();
const url = useAuth ? LOGGED_IN_URL : GUEST_URL;

console.log(`\nNavigating to: ${url}`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

// Dismiss login overlay if present
const dismiss = page.locator(
  ".cta-modal__dismiss-btn, [data-tracking-control-name='public_jobs_dismiss-cta']",
);
if (await dismiss.isVisible({ timeout: 4_000 }).catch(() => false)) {
  await dismiss.click();
  console.log("Dismissed login overlay.");
}

// Give the SPA time to fully render cards
await page.waitForTimeout(4_000);

// ── Test card selectors ───────────────────────────────────────────────────────

const cardResults = {};
for (const sel of CARD_CANDIDATES) {
  cardResults[sel] = await page.locator(sel).count();
}

// ── Test company name selectors ───────────────────────────────────────────────

const companyResults = {};
for (const sel of COMPANY_CANDIDATES) {
  const count = await page.locator(sel).count();
  const texts =
    count > 0
      ? await page
          .locator(sel)
          .allTextContents()
          .then((ts) => ts.map((t) => t.trim()).filter(Boolean).slice(0, 4))
      : [];
  companyResults[sel] = { count, texts };
}

// ── Dump unique class names on <li> elements in the jobs list ────────────────
// This catches renamed selectors not in our candidate list.
const liClasses = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll("li"));
  const classSet = new Set();
  for (const li of items) {
    li.className.split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c));
  }
  return [...classSet].sort();
});

console.log("\n🔍 ALL <li> CLASS NAMES ON PAGE (for spotting renamed selectors)");
console.log("  " + liClasses.join(", "));

// ── Find the best working card selector and dump its HTML ────────────────────

const bestCard = CARD_CANDIDATES.find((s) => cardResults[s] > 0);
let cardHtml = "(no matching card found)";
if (bestCard) {
  cardHtml = await page.locator(bestCard).first().innerHTML();
  // Trim to first 3000 chars to avoid flooding the terminal
  if (cardHtml.length > 3000) cardHtml = cardHtml.slice(0, 3000) + "\n... (truncated)";
}

// ── Print report ─────────────────────────────────────────────────────────────

const line = "─".repeat(70);

console.log(`\n${line}`);
console.log("LINKEDIN SELECTOR DISCOVERY REPORT");
console.log(`Mode: ${useAuth ? "logged-in (saved auth)" : "guest (no auth)"}`);
console.log(line);

console.log("\n📦 JOB CARD SELECTORS");
for (const [sel, count] of Object.entries(cardResults)) {
  const tick = count > 0 ? "✓" : "✗";
  const flag = count > 0 ? " ← WORKS" : "";
  console.log(`  ${tick} ${sel.padEnd(55)} ${count}${flag}`);
}

console.log("\n🏢 COMPANY NAME SELECTORS");
for (const [sel, { count, texts }] of Object.entries(companyResults)) {
  const tick = count > 0 ? "✓" : "✗";
  const sample = texts.length ? `  → "${texts.join('", "')}"` : "";
  console.log(`  ${tick} ${sel.padEnd(55)} ${count}${sample}`);
}

// ── Suggested constants.ts update ───────────────────────────────────────────

const workingCards = CARD_CANDIDATES.filter((s) => cardResults[s] > 0);
const workingCompanies = COMPANY_CANDIDATES.filter(
  (s) => companyResults[s].count > 0,
);

console.log(`\n${line}`);
console.log("SUGGESTED src/shared/constants.ts UPDATE");
console.log(line);
if (workingCards.length === 0) {
  console.log("⚠  No card selectors matched — LinkedIn may have fully changed their DOM.");
  console.log("   Inspect a job card in DevTools and add the class to CARD_CANDIDATES above.");
} else {
  console.log(`\nexport const LINKEDIN_SELECTORS = {`);
  console.log(`  jobCard: [`);
  for (const s of workingCards) console.log(`    "${s}",`);
  console.log(`  ].join(", "),`);
  console.log(`  companyName: [`);
  for (const s of workingCompanies) console.log(`    "${s}",`);
  console.log(`  ].join(", "),`);
  console.log(`};`);
}

console.log(`\n${line}`);
console.log("FIRST MATCHING CARD HTML");
console.log(`Selector: ${bestCard ?? "none"}`);
console.log(line);
console.log(cardHtml);
console.log(line);

await context.close();
