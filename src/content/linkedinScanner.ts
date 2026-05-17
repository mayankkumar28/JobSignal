import { BADGE_ATTR } from "../shared/constants";

export interface ScannedJob {
  element: HTMLElement;
  companyNameElement: HTMLElement;
  companyName: string;
}

/**
 * A scan strategy enumerates raw candidates (card + name element + name text)
 * found by walking the DOM in a particular way. The driver below deduplicates,
 * stamps BADGE_ATTR, and assembles the final ScannedJob list — so a strategy
 * only has to worry about how to locate cards and pull the company name.
 */
interface ScanStrategy {
  name: string;
  enumerate(): Iterable<RawCandidate>;
}

interface RawCandidate {
  card: HTMLElement;
  nameEl: HTMLElement;
  name: string;
}

// ── Strategy A: public / guest view ──────────────────────────────────────────
const GUEST_CARD = ".base-search-card, .base-card";
const GUEST_COMPANY = ".base-search-card__subtitle";

// ── Strategy B: logged-in right panel (job detail view) ──────────────────────
// The detail panel has a stable aria-label="Company, …" on the company element.
const JOB_LINK_SEL = 'a[href*="/jobs/view/"]';
const COMPANY_ARIA_SEL = '[aria-label^="Company, "]';
const COMPANY_LINK_SEL = 'a[href*="/company/"]';

// ── Strategy C: logged-in left panel (job list cards) ────────────────────────
// Left panel cards are div[role="button"] with no job-view anchor and no ARIA
// label on the company. The only stable hook is the company logo img src.
// Company name is the first <p> inside the card that has no element children.
const COMPANY_LOGO_SEL = 'img[src*="company-logo"]';

const guestStrategy: ScanStrategy = {
  name: "guest",
  *enumerate() {
    for (const card of document.querySelectorAll<HTMLElement>(GUEST_CARD)) {
      const nameEl = card.querySelector<HTMLElement>(GUEST_COMPANY);
      if (!nameEl) continue;
      const name = nameEl.textContent?.trim() ?? "";
      if (!name) continue;
      yield { card, nameEl, name };
    }
  },
};

function findRightPanelCard(jobLink: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = jobLink.parentElement;
  for (let depth = 0; depth < 15 && el && el !== document.body; depth++) {
    if (
      el.querySelector(COMPANY_ARIA_SEL) &&
      el.querySelectorAll(JOB_LINK_SEL).length === 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

const rightPanelStrategy: ScanStrategy = {
  name: "right-panel",
  *enumerate() {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(JOB_LINK_SEL)) {
      const card = findRightPanelCard(link);
      if (!card) continue;
      const companyDiv = card.querySelector<HTMLElement>(COMPANY_ARIA_SEL);
      if (!companyDiv) continue;
      const ariaLabel = companyDiv.getAttribute("aria-label") ?? "";
      const name = ariaLabel.replace(/^Company,\s*/, "").replace(/\.$/, "").trim();
      if (!name) continue;
      const nameEl = companyDiv.querySelector<HTMLElement>(COMPANY_LINK_SEL) ?? companyDiv;
      yield { card, nameEl, name };
    }
  },
};

function findLeftPanelCard(logo: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = logo.parentElement;
  while (el && el !== document.body) {
    if (el.getAttribute("role") === "button") return el;
    el = el.parentElement;
  }
  return null;
}

function firstPlainTextParagraph(card: HTMLElement): HTMLElement | null {
  for (const p of card.querySelectorAll<HTMLElement>("p")) {
    if (p.children.length === 0 && (p.textContent?.trim() ?? "").length > 0) {
      return p;
    }
  }
  return null;
}

const leftPanelStrategy: ScanStrategy = {
  name: "left-panel",
  *enumerate() {
    for (const logo of document.querySelectorAll<HTMLElement>(COMPANY_LOGO_SEL)) {
      const card = findLeftPanelCard(logo);
      if (!card) continue;
      const nameEl = firstPlainTextParagraph(card);
      if (!nameEl) continue;
      const name = nameEl.textContent!.trim();
      yield { card, nameEl, name };
    }
  },
};

/**
 * Runs a strategy and assembles its candidates into ScannedJob objects,
 * deduplicating by card (in case a strategy yields the same card twice) and
 * by nameEl (so the same DOM company anchor isn't badged twice when LinkedIn
 * renders the same company under multiple jobs in one card region).
 * Stamps BADGE_ATTR on every card it touches so a re-scan ignores it.
 */
function runStrategy(strategy: ScanStrategy): ScannedJob[] {
  const results: ScannedJob[] = [];
  const seenCards = new Set<HTMLElement>();
  const seenNames = new Set<HTMLElement>();

  for (const { card, nameEl, name } of strategy.enumerate()) {
    if (seenCards.has(card) || card.hasAttribute(BADGE_ATTR)) continue;
    seenCards.add(card);
    card.setAttribute(BADGE_ATTR, "");
    if (seenNames.has(nameEl)) continue;
    seenNames.add(nameEl);
    results.push({ element: card, companyNameElement: nameEl, companyName: name });
  }
  return results;
}

export function scanVisibleJobs(): ScannedJob[] {
  // Guest DOM wins early — if the page is logged-out we won't find the
  // logged-in selectors at all, so don't even try them.
  const guestResults = runStrategy(guestStrategy);
  if (guestResults.length > 0) return guestResults;
  return [...runStrategy(leftPanelStrategy), ...runStrategy(rightPanelStrategy)];
}
