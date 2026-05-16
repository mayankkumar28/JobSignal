# LinkedIn HSM Sponsor Checker — Implementation Plan

## 1. Project Overview

A Chrome Extension (Manifest V3) that augments LinkedIn job listings with visual indicators showing whether the hiring company is a recognized Dutch IND sponsor for the Highly Skilled Migrant (HSM) visa. The extension scans visible job cards, matches company names against the official IND public register, and renders inline badges directly in the LinkedIn DOM.

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                                                         │
│  ┌──────────────┐   messages   ┌─────────────────────┐  │
│  │ Content Script│◄───────────►│ Background Service   │  │
│  │ (linkedin.com)│             │ Worker               │  │
│  │              │             │                     │  │
│  │ • DOM Scanner │             │ • IND Data Fetcher   │  │
│  │ • Badge       │             │ • Cache Manager      │  │
│  │   Renderer    │             │ • Alarm Scheduler    │  │
│  │ • Mutation    │             │                     │  │
│  │   Observer    │             └──────────┬──────────┘  │
│  └──────────────┘                        │              │
│                                          │              │
│  ┌──────────────┐   chrome.storage       │              │
│  │ Popup UI     │◄──────────────────────►│              │
│  │              │                        │              │
│  │ • Stats      │                        │              │
│  │ • Controls   │                        │              │
│  └──────────────┘                        │              │
│                                          │              │
│  ┌──────────────────────────────────┐    │              │
│  │ Shared Modules                   │    │              │
│  │ • sponsorMatcher.ts              │    │              │
│  │ • normalizer.ts                  │    │              │
│  │ • storage.ts                     │    │              │
│  └──────────────────────────────────┘    │              │
└─────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                              ┌─────────────────────┐
                              │ IND Public Register  │
                              │ (ind.nl) or bundled  │
                              │ JSON fallback        │
                              └─────────────────────┘
```

---

## 3. File Structure

```
linkedin-hsm-extension/
├── src/
│   ├── content/
│   │   ├── linkedinScanner.ts      # Finds job cards, extracts company names
│   │   ├── badgeRenderer.ts        # Injects badge elements into the DOM
│   │   ├── domObserver.ts          # MutationObserver + debounce orchestration
│   │   └── index.ts                # Content script entry point
│   ├── background/
│   │   └── serviceWorker.ts        # IND fetch, alarms, message handler
│   ├── popup/
│   │   ├── popup.html              # Popup markup
│   │   ├── popup.ts                # Popup logic (stats, controls)
│   │   └── popup.css               # Popup styles
│   ├── shared/
│   │   ├── sponsorMatcher.ts       # Matching engine (exact + fuzzy)
│   │   ├── sponsorFetcher.ts       # IND register fetch + parse
│   │   ├── normalizer.ts           # Name normalization utilities
│   │   ├── storage.ts              # chrome.storage wrapper
│   │   ├── types.ts                # Shared TypeScript interfaces
│   │   └── constants.ts            # Config values, thresholds, selectors
│   ├── assets/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── data/
│       └── sponsors-snapshot.json  # Bundled fallback sponsor list
├── tests/
│   ├── normalizer.test.ts
│   ├── sponsorMatcher.test.ts
│   ├── linkedinScanner.test.ts
│   └── fixtures/
│       ├── ind-sample.json
│       └── linkedin-dom.html
├── manifest.json
├── tsconfig.json
├── webpack.config.js
├── package.json
├── .eslintrc.json
└── README.md
```

---

## 4. Module-by-Module Implementation Plan

### 4.1 `shared/types.ts` — Type Definitions

Define all shared interfaces up front so every module has a single source of truth.

```ts
// Key types to define:

interface SponsorEntry {
  originalName: string;    // Raw name from IND register
  normalizedName: string;  // After normalization pipeline
  tokens: string[];        // Individual word tokens for overlap scoring
}

interface MatchResult {
  matched: boolean;
  confidence: "exact" | "fuzzy" | "none";
  sponsorName: string | null;   // The IND register name that matched
  score: number;                // 0–1 similarity score
}

interface SponsorCache {
  sponsors: SponsorEntry[];
  fetchedAt: number;           // Unix timestamp
  version: string;
}

interface ExtensionStats {
  companiesScanned: number;
  sponsorsFound: number;
  lastSyncTimestamp: number;
}

interface ExtensionSettings {
  matchingMode: "strict" | "fuzzy";
}

// Message types for content ↔ background communication
type MessageType =
  | { type: "GET_SPONSORS" }
  | { type: "REFRESH_SPONSORS" }
  | { type: "GET_STATS" }
  | { type: "UPDATE_STATS"; payload: Partial<ExtensionStats> };
```

**Why first:** Every other module imports from here. Defining the contract before writing logic prevents mismatches.

---

### 4.2 `shared/constants.ts` — Configuration

Centralizes all magic values so they're tunable without hunting through code.

```ts
// Values to define:

const IND_REGISTER_URL = "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";
const CACHE_KEY = "hsm_sponsor_cache";
const STATS_KEY = "hsm_extension_stats";
const SETTINGS_KEY = "hsm_extension_settings";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// LinkedIn DOM selectors (will need periodic maintenance)
const LINKEDIN_SELECTORS = {
  jobCard: ".job-card-container, .jobs-search-results__list-item",
  companyName: ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle",
  jobTitle: ".job-card-list__title",
};

const DEBOUNCE_MS = 200;
const FUZZY_THRESHOLD = 0.75;  // Minimum score for "fuzzy" match
const BADGE_ATTR = "data-hsm-checked"; // Marker to skip processed cards

const DUTCH_SUFFIXES = [
  "bv", "b.v.", "nv", "n.v.",
  "holding", "group", "netherlands",
  "international", "europe", "the netherlands",
];
```

---

### 4.3 `shared/normalizer.ts` — Name Normalization

The most critical utility. Bad normalization = false positives or missed matches.

**Normalization pipeline (applied in order):**

1. `toLowerCase()`
2. Strip all punctuation except alphanumeric and spaces: `replace(/[^a-z0-9\s]/g, " ")`
3. Collapse multiple spaces: `replace(/\s+/g, " ").trim()`
4. Remove Dutch legal suffixes from the end of the string (iterate `DUTCH_SUFFIXES`, strip if trailing)
5. Re-trim

**Functions to export:**

```
normalize(name: string): string
tokenize(normalizedName: string): string[]   // split on spaces, filter empties
```

**Edge cases to handle:**

| Input                      | Normalized         | Tokens                |
|----------------------------|--------------------|-----------------------|
| `"Booking.com B.V."`      | `"booking com"`    | `["booking", "com"]`  |
| `"Uber Netherlands B.V."` | `"uber"`           | `["uber"]`            |
| `"ASML Holding N.V."`     | `"asml"`           | `["asml"]`            |
| `"Shell"`                  | `"shell"`          | `["shell"]`           |
| `"TomTom N.V."`           | `"tomtom"`         | `["tomtom"]`          |

**Implementation note:** Suffix stripping must loop — `"Uber Netherlands B.V."` needs to strip both `"b.v."` and `"netherlands"`. Apply suffix removal repeatedly until no more suffixes match.

---

### 4.4 `shared/sponsorMatcher.ts` — Matching Engine

Consumes a `SponsorEntry[]` and a company name; returns a `MatchResult`.

**Algorithm:**

```
function isRecognizedSponsor(
  companyName: string,
  sponsors: SponsorEntry[],
  mode: "strict" | "fuzzy"
): MatchResult

Step 1 — Normalize the input name.
Step 2 — Exact match: check if normalizedName exists in the sponsor set
         (use a Map<string, SponsorEntry> for O(1) lookup).
         If match → return { matched: true, confidence: "exact", score: 1.0, ... }

Step 3 — If mode === "strict", stop here → return no match.

Step 4 — Token overlap scoring:
         For each sponsor, compute:
           overlap = |inputTokens ∩ sponsorTokens| / max(|inputTokens|, |sponsorTokens|)
         Track the best scoring sponsor.

Step 5 — If bestScore >= FUZZY_THRESHOLD → return { matched: true, confidence: "fuzzy", ... }
         Else → return { matched: false, confidence: "none", score: bestScore }
```

**Why token overlap instead of Levenshtein:** Levenshtein is character-level and expensive across thousands of sponsors. Token overlap is cheap, handles word reordering, and aligns well with the suffix-stripping strategy (the remaining tokens are the meaningful company identity).

**Performance optimization:** Pre-build a `Map<string, SponsorEntry>` for exact lookups and a sorted array for token scanning. Content script calls this synchronously — it must be fast.

---

### 4.5 `shared/sponsorFetcher.ts` — IND Data Acquisition

**Strategy (ordered by preference):**

1. **Background fetch:** The service worker fetches the IND page HTML, parses company names from the table/list structure. No CORS issues because background `fetch()` in Manifest V3 is not subject to page-level CORS.
2. **Fallback — bundled snapshot:** If the network fetch fails (IND site down, parsing breaks), fall back to `data/sponsors-snapshot.json` shipped with the extension.

**Parsing logic:**

```
async function fetchSponsorsFromIND(): Promise<string[]>

1. fetch(IND_REGISTER_URL) from background context
2. Parse HTML response as text
3. The IND page renders a table of recognised sponsors.
   Extract company names from table rows.
   Strategy: use regex or DOMParser to find <td> elements
   in the sponsor table. The IND page uses a server-rendered
   table — locate by known CSS class or table heading.
4. Return array of raw company name strings.
```

**Post-processing:**

```
function buildSponsorCache(rawNames: string[]): SponsorCache
  - For each name: normalize, tokenize, store as SponsorEntry
  - Attach fetchedAt timestamp
  - Write to chrome.storage.local
```

**Error handling:**
- Network timeout → use bundled fallback, log warning
- HTML structure changed (0 names parsed) → use bundled fallback, log warning
- Malformed names → skip entry, don't crash the pipeline

---

### 4.6 `shared/storage.ts` — Storage Wrapper

Thin async wrapper around `chrome.storage.local` to avoid callback spaghetti and centralize key management.

```
async function getSponsorCache(): Promise<SponsorCache | null>
async function setSponsorCache(cache: SponsorCache): Promise<void>
async function getStats(): Promise<ExtensionStats>
async function updateStats(partial: Partial<ExtensionStats>): Promise<void>
async function getSettings(): Promise<ExtensionSettings>
async function setSettings(settings: ExtensionSettings): Promise<void>
```

All reads/writes go through these functions. No other module touches `chrome.storage` directly.

---

### 4.7 `background/serviceWorker.ts` — Background Orchestration

**Responsibilities:**

1. **On install:** Fetch IND data immediately, populate cache.
2. **Alarm:** Register a `chrome.alarms` alarm named `"refresh-sponsors"` that fires every 30 days. On alarm fire → re-fetch IND data.
3. **Message handler:** Listen for messages from content script and popup.

**Message handling:**

| Message                  | Response                                  |
|--------------------------|-------------------------------------------|
| `GET_SPONSORS`           | Return `SponsorCache` from storage        |
| `REFRESH_SPONSORS`       | Re-fetch IND data, return updated cache   |
| `GET_STATS`              | Return `ExtensionStats` from storage      |
| `UPDATE_STATS`           | Merge partial stats, save, return void    |

**Lifecycle pseudocode:**

```
chrome.runtime.onInstalled → {
  fetchAndCacheSponsors();
  chrome.alarms.create("refresh-sponsors", { periodInMinutes: 43200 }); // 30 days
}

chrome.alarms.onAlarm → {
  if (alarm.name === "refresh-sponsors") fetchAndCacheSponsors();
}

chrome.runtime.onMessage → {
  switch (message.type) { ... }
}
```

---

### 4.8 `content/linkedinScanner.ts` — Job Card Discovery

**Purpose:** Find job card elements, extract company names, and return them paired with the DOM element to badge.

```
interface ScannedJob {
  element: HTMLElement;          // The job card container
  companyNameElement: HTMLElement; // The specific node to append the badge to
  companyName: string;
}

function scanVisibleJobs(): ScannedJob[]

1. querySelectorAll using LINKEDIN_SELECTORS.jobCard
2. For each card:
   a. Skip if card.hasAttribute(BADGE_ATTR) — already processed
   b. Find company name child using LINKEDIN_SELECTORS.companyName
   c. Extract textContent, trim
   d. If name is empty/null, skip
   e. Mark card with BADGE_ATTR
   f. Push to results
3. Return results
```

**LinkedIn DOM resilience:** LinkedIn changes class names periodically. The `LINKEDIN_SELECTORS` object is the single place to update. Multiple fallback selectors are comma-separated in each entry so at least one typically works.

---

### 4.9 `content/badgeRenderer.ts` — Visual Badge Injection

**Purpose:** Given a `ScannedJob` and a `MatchResult`, inject a styled badge element next to the company name.

```
function renderBadge(job: ScannedJob, result: MatchResult): void

1. If result.confidence === "none" → do nothing.
2. Create a <span> element.
3. If confidence === "exact":
     textContent = "🇳🇱 HSM Sponsor"
     class = "hsm-badge hsm-badge--confirmed"
     title = "Recognized IND sponsor for Netherlands Highly Skilled Migrant visa"
4. If confidence === "fuzzy":
     textContent = "⚠ Possible Sponsor"
     class = "hsm-badge hsm-badge--uncertain"
     title = "Possible IND sponsor match—verify manually"
5. Append badge to job.companyNameElement
```

**Styles (injected via content CSS or a `<style>` element):**

```css
.hsm-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin-left: 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  vertical-align: middle;
  cursor: default;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

.hsm-badge--confirmed {
  background: #16a34a;
  color: #ffffff;
}

.hsm-badge--uncertain {
  background: #f59e0b;
  color: #ffffff;
}
```

**DOM safety:** If the company name element's parent has `overflow: hidden`, the badge might get clipped. Append to the nearest non-clipped ancestor, or set `overflow: visible` on the parent (low risk since it's a text container).

---

### 4.10 `content/domObserver.ts` — Mutation Monitoring

**Purpose:** Watch for new job cards appearing as the user scrolls or navigates within the LinkedIn SPA.

```
function startObserver(callback: () => void): MutationObserver

1. Create a debounced version of callback (DEBOUNCE_MS).
2. Create MutationObserver watching:
     - childList: true
     - subtree: true
   on the <main> element (or document.body as fallback).
3. On mutation → call debouncedCallback.
4. Return the observer so it can be disconnected if needed.
```

**Debounce implementation:** Simple trailing-edge debounce. LinkedIn often fires dozens of mutations in rapid succession when loading a new page of results; we want a single scan pass after the burst settles.

**SPA navigation detection:** LinkedIn uses `history.pushState`. Additionally listen for `popstate` and `hashchange` events to re-trigger scanning when navigating between job pages.

---

### 4.11 `content/index.ts` — Content Script Entry Point

**Orchestration flow:**

```
1. Request sponsor data from background:
     chrome.runtime.sendMessage({ type: "GET_SPONSORS" })
     → receive SponsorCache

2. Read settings from storage (strict vs fuzzy mode).

3. Define the core scan function:
     processBatch():
       a. const jobs = scanVisibleJobs()
       b. For each job:
            const result = isRecognizedSponsor(job.companyName, sponsors, mode)
            renderBadge(job, result)
       c. Update stats (companiesScanned += jobs.length, sponsorsFound += matched count)
       d. Send UPDATE_STATS message to background

4. Run processBatch() immediately.

5. Start domObserver(processBatch).

6. Also listen for scroll events (throttled) as a safety net
   in case MutationObserver misses lazy-loaded cards.
```

---

### 4.12 `popup/popup.ts` — Popup UI Logic

**On open:**

1. Send `GET_STATS` message to background → display companiesScanned, sponsorsFound, lastSyncTimestamp.
2. Read current settings → set toggle position.

**User actions:**

| Control                | Action                                                 |
|------------------------|--------------------------------------------------------|
| "Refresh Sponsors"     | Send `REFRESH_SPONSORS` → update lastSyncTimestamp     |
| Strict/Fuzzy toggle    | Save to settings via storage.ts, notify content script |

**Popup HTML structure:**

```
┌────────────────────────────────┐
│  🇳🇱 HSM Sponsor Checker       │
├────────────────────────────────┤
│  Companies scanned:    142     │
│  Sponsors found:        23     │
│  Last synced:  2026-05-01      │
├────────────────────────────────┤
│  Matching mode:                │
│  [● Strict] [ Fuzzy ]         │
├────────────────────────────────┤
│  [ 🔄 Refresh Sponsor List ]  │
└────────────────────────────────┘
```

---

### 4.13 `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "LinkedIn HSM Sponsor Checker",
  "version": "1.0.0",
  "description": "Identifies Dutch IND-recognised HSM visa sponsors on LinkedIn job listings.",
  "permissions": ["storage", "alarms"],
  "host_permissions": [
    "https://ind.nl/*"
  ],
  "background": {
    "service_worker": "background/serviceWorker.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/jobs/*"],
      "js": ["content/index.js"],
      "css": ["content/badges.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icon-16.png",
      "48": "assets/icon-48.png",
      "128": "assets/icon-128.png"
    }
  },
  "icons": {
    "16": "assets/icon-16.png",
    "48": "assets/icon-48.png",
    "128": "assets/icon-128.png"
  }
}
```

---

## 5. Data Flow Diagrams

### 5.1 Initial Load

```
User opens LinkedIn /jobs
        │
        ▼
Content script loads
        │
        ├──► sendMessage(GET_SPONSORS) ──► Service Worker
        │                                      │
        │                              reads chrome.storage
        │                                      │
        │    ◄── SponsorCache response ◄───────┘
        │
        ▼
scanVisibleJobs()
        │
        ▼
For each job card:
  isRecognizedSponsor(name, sponsors)
        │
        ▼
renderBadge() if matched
        │
        ▼
startObserver(processBatch)  ──► watches for new DOM nodes
```

### 5.2 Sponsor Data Refresh

```
chrome.alarms fires "refresh-sponsors"
        │
        ▼
Service Worker: fetchSponsorsFromIND()
        │
        ├── success ──► buildSponsorCache() ──► chrome.storage.local.set()
        │
        └── failure ──► log warning, keep existing cache
```

---

## 6. Build System

### 6.1 `package.json` Key Dependencies

| Package              | Purpose                                 |
|----------------------|-----------------------------------------|
| `typescript`         | Language                                |
| `webpack`            | Bundler — produces separate chunks      |
| `webpack-cli`        | CLI for webpack                         |
| `ts-loader`          | TypeScript compilation in webpack       |
| `copy-webpack-plugin`| Copy manifest.json, HTML, CSS, assets   |
| `eslint`             | Linting                                 |
| `vitest`             | Fast unit testing                       |

### 6.2 Webpack Configuration

Multiple entry points, one per Chrome extension context:

```js
entry: {
  "content/index":       "./src/content/index.ts",
  "background/serviceWorker": "./src/background/serviceWorker.ts",
  "popup/popup":         "./src/popup/popup.ts",
}
output: {
  path: "dist/",
  filename: "[name].js",
}
```

Shared modules (`shared/*`) are imported by each entry and tree-shaken / inlined by webpack — no separate shared chunk (Chrome extensions don't support dynamic imports in content scripts).

### 6.3 NPM Scripts

```
npm run build       → webpack --mode production
npm run dev         → webpack --mode development --watch
npm run lint        → eslint src/
npm run test        → vitest run
npm run test:watch  → vitest
```

---

## 7. Testing Plan

### 7.1 Unit Tests — `normalizer.test.ts`

| Input                          | Expected normalized output |
|--------------------------------|----------------------------|
| `"Booking.com B.V."`          | `"booking com"`            |
| `"Uber Netherlands B.V."`     | `"uber"`                   |
| `"ASML Holding N.V."`         | `"asml"`                   |
| `"TomTom N.V."`               | `"tomtom"`                 |
| `"Shell"`                      | `"shell"`                  |
| `"ING Group N.V."`            | `"ing"`                    |
| `"  Adyen  N.V.  "`           | `"adyen"`                  |
| `""`                           | `""`                       |

### 7.2 Unit Tests — `sponsorMatcher.test.ts`

Using a fixture list of ~10 known sponsors:

| LinkedIn Name           | Mode    | Expected confidence |
|-------------------------|---------|---------------------|
| `"Booking.com"`         | strict  | exact               |
| `"Booking.com B.V."`   | strict  | exact               |
| `"UBER"`                | strict  | exact               |
| `"Uber Netherlands"`    | strict  | exact               |
| `"Adyen"`               | strict  | exact               |
| `"Fake Corp"`           | strict  | none                |
| `"Book"`                | fuzzy   | none (below threshold) |
| `"ASML Holding"`        | fuzzy   | exact               |

### 7.3 DOM Tests — `linkedinScanner.test.ts`

Use a mock HTML fixture (`fixtures/linkedin-dom.html`) representing a simplified LinkedIn job card structure. Verify:

- Cards are found and company names extracted
- Already-processed cards (with `data-hsm-checked`) are skipped
- Missing company name elements are gracefully skipped

### 7.4 Integration Smoke Test

Manual checklist after loading the unpacked extension:

1. Navigate to `linkedin.com/jobs` → badges appear on known sponsors
2. Scroll down → new cards get badges
3. Open popup → stats are non-zero, last sync date is shown
4. Click refresh → last sync updates
5. Toggle to strict → fuzzy badges disappear
6. Disconnect network, reload → bundled fallback still works

---

## 8. Performance Budget

| Metric                              | Target    | Strategy                                     |
|-------------------------------------|-----------|----------------------------------------------|
| Incremental scan (new batch)        | < 50 ms   | Skip processed cards via attribute tag        |
| Matching per company name           | < 0.1 ms  | O(1) exact lookup via Map, linear fuzzy only on miss |
| Memory (sponsor data in RAM)        | < 2 MB    | ~10K sponsors × ~100 bytes ≈ 1 MB            |
| Observer debounce                   | 200 ms    | Batches rapid DOM mutations                   |
| Full page initial scan              | < 200 ms  | Typically 25 cards on screen                  |

---

## 9. Error Handling Matrix

| Failure Scenario                    | Handling                                              |
|-------------------------------------|-------------------------------------------------------|
| IND site unreachable                | Use cached data; if no cache, use bundled snapshot     |
| IND HTML structure changed          | Parse returns 0 names → keep existing cache, log error |
| LinkedIn DOM selectors break        | Scanner returns 0 jobs → no badges, no crash           |
| chrome.storage quota exceeded       | Truncate oldest cache metadata; sponsors data is small |
| Content script loaded before DOM    | `run_at: document_idle` + null checks                  |
| Company name is empty string        | Skip in scanner, never pass to matcher                 |
| Popup opened with no data yet       | Show "Syncing…" placeholder state                      |

---

## 10. Development Workflow

### Loading the extension locally

```
1. npm install
2. npm run dev          # builds to dist/ with watch mode
3. Open chrome://extensions
4. Enable "Developer mode"
5. Click "Load unpacked" → select the dist/ folder
6. Navigate to linkedin.com/jobs
```

### Updating LinkedIn selectors

When LinkedIn changes their DOM (expect this every few months):

1. Inspect a job card in DevTools
2. Update `LINKEDIN_SELECTORS` in `constants.ts`
3. Rebuild
4. Reload extension

### Refreshing the bundled sponsor snapshot

```
1. Visit https://ind.nl/en/public-register-recognised-sponsors/public-register-work
2. Copy the sponsor table data
3. Run the conversion script: npm run update-snapshot
4. Commit the updated sponsors-snapshot.json
```

---

## 11. Future Enhancements (Post-MVP)

These are scoped out of the initial build but designed to be easy additions given the modular architecture:

| Feature                           | Complexity | Module affected              |
|-----------------------------------|------------|------------------------------|
| Manual company check in popup     | Low        | popup.ts + sponsorMatcher    |
| Filter LinkedIn to sponsors only  | Medium     | linkedinScanner (hide cards) |
| Export sponsor jobs to CSV        | Low        | popup.ts (new button)        |
| User whitelist/blacklist          | Low        | storage.ts + matcher         |
| Badge color theme options         | Low        | popup settings + CSS vars    |
| Role-specific filtering (SWE)     | Medium     | linkedinScanner (title check)|

---

## 12. Implementation Order

Recommended build sequence, each step produces a testable artifact:

| Phase | Modules                                        | Milestone                          |
|-------|------------------------------------------------|------------------------------------|
| 1     | types, constants, normalizer                   | Tests pass for name normalization  |
| 2     | sponsorMatcher + test fixtures                 | Matching logic verified            |
| 3     | sponsorFetcher + bundled snapshot               | Can load sponsor data              |
| 4     | storage wrapper                                | Read/write works in extension      |
| 5     | serviceWorker (fetch + cache + alarms)          | Background script functional       |
| 6     | linkedinScanner + badgeRenderer                 | Badges appear on LinkedIn          |
| 7     | domObserver + content/index                     | Dynamic content handled            |
| 8     | popup UI                                        | Stats and controls working         |
| 9     | Webpack config, manifest, build scripts         | `npm run build` produces dist/     |
| 10    | README, lint config, final testing              | Ready for Chrome Web Store         |

Phases 1–4 are pure logic with no browser dependency — they can be built and fully tested in Node before touching any extension APIs.
