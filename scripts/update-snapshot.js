#!/usr/bin/env node
/**
 * Fetches the latest IND public register and updates src/data/sponsors-snapshot.json.
 * Run manually when you want to refresh the bundled fallback list:
 *   npm run update-snapshot
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const URL =
  "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";
const OUT = path.resolve(__dirname, "../src/data/sponsors-snapshot.json");

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetch(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

// Mirror of decodeEntities() in src/shared/sponsorFetcher.ts.
// Keep in sync — the unit tests cover the canonical TS version.
const NAMED = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
function decodeEntities(s) {
  return s.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (match, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    if (name && NAMED[name]) return NAMED[name];
    return match;
  });
}

function parseNames(html) {
  const names = [];
  const pattern = /<th[^>]+scope="row"[^>]*>([\s\S]*?)<\/th>/g;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const name = decodeEntities(m[1]).trim();
    if (name) names.push(name);
  }
  return names;
}

(async () => {
  console.log("Fetching IND public register…");
  const html = await fetch(URL);
  const names = parseNames(html);
  if (names.length === 0) {
    console.error("ERROR: parsed 0 names — page structure may have changed.");
    process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(names, null, 2) + "\n", "utf-8");
  console.log(`✓ Wrote ${names.length} sponsors to ${path.relative(process.cwd(), OUT)}`);
})().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
