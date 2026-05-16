# JobSignal

A Chrome Extension (Manifest V3) that overlays LinkedIn job listings with signals about hiring companies. The first signal: whether a company is a recognised Dutch IND visa sponsor.

## What it does

While browsing `linkedin.com/jobs`, the extension:

- Scans every visible job card for the company name
- Matches it against the [IND public register of recognised sponsors](https://ind.nl/en/public-register-recognised-sponsors/public-register-work) (12,000+ entries)
- Injects an inline badge — **🇳🇱 Visa Sponsor** (green) for confirmed matches, **⚠ Possible Sponsor** (amber) for fuzzy matches
- Continues scanning as you scroll or navigate within the LinkedIn SPA

The sponsor list is cached locally for 30 days and refreshed automatically.

## Screenshots

```
┌────────────────────────────────────────┐
│  Software Engineer                     │
│  Booking.com  🇳🇱 Visa Sponsor         │  ← confirmed match
├────────────────────────────────────────┤
│  Data Analyst                          │
│  Some Startup  ⚠ Possible Sponsor      │  ← fuzzy match
├────────────────────────────────────────┤
│  Product Manager                       │
│  Unknown Corp                          │  ← no badge
└────────────────────────────────────────┘
```

## Matching modes

| Mode | Behaviour |
|------|-----------|
| **Strict** | Exact match only after name normalisation (strips legal suffixes like B.V., N.V., Holding, Netherlands). Zero false positives. |
| **Fuzzy** | Adds token-overlap scoring. Catches variants like `"Booking"` vs `"Booking.com B.V."`. May produce occasional false positives. |

Switch between modes from the popup.

## Development setup

```bash
cd linkedin-hsm-extension
npm install
npm run dev        # build to dist/ with watch mode
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
npm test           # single run (112 tests, ~1 s)
npm run test:watch # watch mode
```

## Linting

```bash
npm run lint
```

## Refreshing the bundled sponsor snapshot

The extension ships with a bundled fallback (`src/data/sponsors-snapshot.json`) used when the IND site is unreachable. Refresh it before a release:

```bash
npm run update-snapshot
# → fetches ind.nl, writes src/data/sponsors-snapshot.json, prints count
git add src/data/sponsors-snapshot.json
git commit -m "chore: refresh IND sponsor snapshot"
```

The IND register updates monthly. The extension also auto-fetches on install and every 30 days via `chrome.alarms`.

## Updating LinkedIn selectors

LinkedIn changes their DOM periodically. If badges stop appearing:

1. Open DevTools on a LinkedIn jobs page
2. Inspect a job card and find the current class names
3. Update `LINKEDIN_SELECTORS` in `src/shared/constants.ts`
4. Rebuild and reload the extension

## Architecture

```
src/
├── background/
│   └── serviceWorker.ts   IND fetch, alarm scheduling, message dispatcher
├── content/
│   ├── index.ts           Entry point — orchestrates scan → match → badge
│   ├── linkedinScanner.ts Finds unprocessed job cards, extracts company names
│   ├── badgeRenderer.ts   Injects badge <span> elements into the DOM
│   ├── domObserver.ts     MutationObserver + popstate/hashchange for SPA nav
│   └── badges.css         Badge pill styles
├── popup/
│   ├── popup.html/ts/css  Stats display, mode toggle, refresh button
└── shared/
    ├── types.ts            Shared TypeScript interfaces
    ├── constants.ts        Selectors, keys, thresholds, Dutch legal suffixes
    ├── normalizer.ts       Name normalisation pipeline (lowercase → strip suffixes)
    ├── sponsorMatcher.ts   Exact + token-overlap fuzzy matching engine
    ├── sponsorFetcher.ts   IND HTML fetch + parser + cache builder
    └── storage.ts          chrome.storage.local wrapper
```

**Data flow (initial load):**

```
LinkedIn /jobs page loads
  → content script requests GET_SPONSORS from service worker
  → service worker returns cached SponsorCache
  → content script builds SponsorIndex (O(1) Map)
  → scanVisibleJobs() → isRecognizedSponsor() → renderBadge()
  → MutationObserver watches for new cards as user scrolls
```

## Tech stack

| Tool | Purpose |
|------|---------|
| TypeScript 5 | Language |
| Webpack 5 | Bundler (3 entry points, no code splitting) |
| ts-loader | TypeScript compilation in webpack |
| Vitest | Unit tests (112 tests across 9 files) |
| jsdom | DOM environment for content script tests |
| ESLint 9 + typescript-eslint | Linting |

## Privacy

The extension:

- Makes **one outbound network request** — to `ind.nl` to fetch the public sponsor register
- Stores the sponsor list and usage stats in `chrome.storage.local` (never synced, never sent anywhere)
- Does **not** collect, transmit, or share any personal data or browsing history

## License

© 2026 Mayank Kumar. All rights reserved. This software is proprietary and confidential.

For licensing inquiries or commercial use, please contact mayank.zxc@gmail.com
