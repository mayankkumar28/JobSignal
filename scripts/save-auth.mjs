/**
 * save-auth.mjs
 *
 * Opens a real Chrome browser window and waits for you to log into LinkedIn
 * manually. Once you're on a LinkedIn page and the script detects you're
 * logged in, it saves the session cookies to scripts/.auth-state.json.
 *
 * That file is then used by:
 *   node scripts/discover-selectors.mjs --logged-in
 *
 * The file contains session cookies — do NOT commit it to git.
 *
 * Usage:
 *   node scripts/save-auth.mjs
 */

import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const AUTH_FILE = path.resolve("scripts/.auth-state.json");

console.log("Opening Chrome — log into LinkedIn, then come back here.");
console.log("The script will detect when you're logged in and save the session.\n");

const context = await chromium.launchPersistentContext("", {
  headless: false,
  args: ["--no-first-run", "--disable-default-apps"],
});

const page = await context.newPage();
await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });

// Poll until the user is logged in (feed or jobs page appears)
console.log("Waiting for you to log in...");
let loggedIn = false;
while (!loggedIn) {
  await page.waitForTimeout(2_000);
  const url = page.url();
  // LinkedIn redirects to /feed/ or /jobs/ after login
  if (url.includes("/feed") || url.includes("/jobs") || url.includes("/mynetwork")) {
    loggedIn = true;
  }
}

console.log("✓ Logged in detected. Saving auth state...");
await context.storageState({ path: AUTH_FILE });
console.log(`✓ Saved to ${AUTH_FILE}`);
console.log("\nYou can now run:");
console.log("  node scripts/discover-selectors.mjs --logged-in");

await context.close();
