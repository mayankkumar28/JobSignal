# JobSignal

A Chrome Extension (Manifest V3) that overlays LinkedIn job listings with signals about hiring companies. The first signal: whether a company is a recognised Dutch IND visa sponsor.

## What it does

While browsing `linkedin.com/jobs`, the extension:

- Scans every visible job card for the company name — both the left-panel list and the right-panel detail view
- Matches it against the [IND public register of recognised sponsors](https://ind.nl/en/public-register-recognised-sponsors/public-register-work) (12,000+ entries)
- Injects an inline badge — **🇳🇱 Visa Sponsor** (green) for confirmed matches
- Continues scanning as you scroll, paginate, or navigate within the LinkedIn SPA

The sponsor list is cached locally and refreshed automatically on browser start if stale (30-day TTL).

## Screenshots

```
┌────────────────────────────────────────┐
│  Software Engineer                     │
│  Booking.com  🇳🇱 Visa Sponsor         │  ← confirmed match
├────────────────────────────────────────┤
│  Data Analyst                          │
│  Adyen N.V.   🇳🇱 Visa Sponsor         │  ← fuzzy match (score = 1.0)
├────────────────────────────────────────┤
│  Product Manager                       │
│  Unknown Corp                          │  ← no badge
└────────────────────────────────────────┘
```

## Matching

Name normalisation strips Dutch legal suffixes (B.V., N.V., Holding, Netherlands, …) iteratively until stable, then does an exact map lookup. If that misses, token-overlap fuzzy scoring runs against all entries — a match requires >80% token overlap. Short display names like `"Hadrian"` correctly match `"Hadrian Security B.V."` because the score denominator is `Math.min(input tokens, candidate tokens)`, so all-input-tokens-matched = score 1.0.

## Development setup

```bash
npm install
npm run dev        # webpack watch mode → dist/
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. Navigate to `linkedin.com/jobs`

## Building for production

```bash
npm run build
```

Output lands in `dist/`. Load `dist/` as an unpacked extension or zip it for the Chrome Web Store.

## Running tests

```bash
npm test                    # unit + integration (143 tests, ~1 s)
npm run test:watch          # watch mode
npm run test:e2e            # Playwright fixture e2e (17 tests, ~1.5 min)
```

Run a single file or pattern:

```bash
npx vitest run tests/normalizer.test.ts
npx vitest run -t "exact match"
```

## Linting

```bash
npm run lint
```

## Refreshing the bundled sponsor snapshot

The extension ships with a bundled fallback (`src/data/sponsors-snapshot.json`) used when the IND site is unreachable. Refresh it before a release:

```bash
npm run update-snapshot
git add src/data/sponsors-snapshot.json
git commit -m "chore: refresh IND sponsor snapshot"
```

## Updating LinkedIn selectors

LinkedIn changes their DOM periodically. If badges stop appearing:

1. Open DevTools on a LinkedIn jobs page
2. Inspect a job card and find the current class names
3. Update selectors in `src/content/linkedinScanner.ts`
4. Rebuild and reload the extension

A weekly canary workflow (`linkedin-canary.yml`) runs Playwright against the live LinkedIn guest DOM and opens a GitHub issue if the selectors break.

## Architecture

```
src/
├── background/
│   └── serviceWorker.ts   IND fetch, alarm scheduling, message dispatcher
├── content/
│   ├── index.ts           Entry point — orchestrates scan → match → badge
│   ├── linkedinScanner.ts Finds unprocessed job cards (guest, left panel, right panel)
│   ├── badgeRenderer.ts   Injects badge <span> elements into the DOM
│   ├── domObserver.ts     MutationObserver on document.body for SPA nav
│   └── badges.css         Badge pill styles
├── popup/
│   ├── popup.html/ts/css  Stats display + refresh button
└── shared/
    ├── types.ts            Shared TypeScript interfaces
    ├── constants.ts        Keys, thresholds, Dutch legal suffixes
    ├── normalizer.ts       Name normalisation pipeline (lowercase → strip suffixes)
    ├── sponsorMatcher.ts   Exact + token-overlap fuzzy matching engine
    ├── sponsorFetcher.ts   IND HTML fetch + parser + cache builder
    └── storage.ts          chrome.storage.local wrapper
```

**LinkedIn scanner strategies:**

| Strategy | DOM pattern | When |
|----------|-------------|------|
| Guest | `.base-search-card` + `.base-search-card__subtitle` | Logged-out view |
| Left panel | `img[src*="company-logo"]` → `[role="button"]` → first plain-text `<p>` | Logged-in job list |
| Right panel | `a[href*="/jobs/view/"]` + `[aria-label^="Company, "]` | Logged-in detail view |

**Data flow:**

```
LinkedIn /jobs page loads
  → content script requests GET_SPONSORS from service worker
  → service worker returns cached SponsorCache
  → content script builds SponsorIndex (O(1) Map)
  → scanVisibleJobs() → isRecognizedSponsor() → renderBadge()
  → MutationObserver + pushState hook watch for new cards / SPA navigation
```

## Tech stack

| Tool | Purpose |
|------|---------|
| TypeScript 6 | Language |
| Webpack 5 | Bundler (3 entry points, no code splitting) |
| ts-loader | TypeScript compilation in webpack |
| Vitest 4 | Unit + integration tests |
| Playwright | E2E tests (fixture server + live LinkedIn canary) |
| jsdom | DOM environment for content script unit tests |
| ESLint 10 + typescript-eslint | Linting |
| Node.js 24 | Runtime (CI + local dev) |

## Privacy

The extension:

- Makes **one outbound network request** — to `ind.nl` to fetch the public sponsor register
- Stores the sponsor list and usage stats in `chrome.storage.local` (never synced, never sent anywhere)
- Does **not** collect, transmit, or share any personal data or browsing history
