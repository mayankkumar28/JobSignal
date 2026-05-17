import { BADGE_ATTR } from "../shared/constants";

export interface ScannedJob {
  element: HTMLElement;
  companyNameElement: HTMLElement;
  companyName: string;
}

// ── Strategy A: public / guest view ──────────────────────────────────────────
const GUEST_CARD = ".base-search-card, .base-card";
const GUEST_COMPANY = ".base-search-card__subtitle";

// ── Strategy B: logged-in right panel (job detail view) ───────────────────────
// The detail panel has a stable aria-label="Company, …" on the company element.
const JOB_LINK_SEL = 'a[href*="/jobs/view/"]';
const COMPANY_ARIA_SEL = '[aria-label^="Company, "]';
const COMPANY_LINK_SEL = 'a[href*="/company/"]';

// ── Strategy C: logged-in left panel (job list cards) ─────────────────────────
// Left panel cards are div[role="button"] with no job-view anchor and no ARIA
// label on the company. The only stable hook is the company logo img src.
// Company name is the first <p> inside the card that has no element children.
const COMPANY_LOGO_SEL = 'img[src*="company-logo"]';

function scanGuestDOM(): ScannedJob[] {
  const cards = document.querySelectorAll<HTMLElement>(GUEST_CARD);
  if (cards.length === 0) return [];

  const results: ScannedJob[] = [];
  const seen = new Set<HTMLElement>();

  for (const card of cards) {
    if (card.hasAttribute(BADGE_ATTR)) continue;

    const nameEl = card.querySelector<HTMLElement>(GUEST_COMPANY);
    if (!nameEl) continue;

    const companyName = nameEl.textContent?.trim() ?? "";
    if (!companyName) continue;

    card.setAttribute(BADGE_ATTR, "");
    if (seen.has(nameEl)) continue;
    seen.add(nameEl);
    results.push({ element: card, companyNameElement: nameEl, companyName });
  }
  return results;
}

function findCardContainer(jobLink: HTMLElement): HTMLElement | null {
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

function scanRightPanelDOM(): ScannedJob[] {
  const jobLinks = document.querySelectorAll<HTMLAnchorElement>(JOB_LINK_SEL);
  if (jobLinks.length === 0) return [];

  const results: ScannedJob[] = [];
  const seen = new Set<HTMLElement>();

  for (const link of jobLinks) {
    const card = findCardContainer(link);
    if (!card || card.hasAttribute(BADGE_ATTR)) continue;

    const companyDiv = card.querySelector<HTMLElement>(COMPANY_ARIA_SEL);
    if (!companyDiv) continue;

    const ariaLabel = companyDiv.getAttribute("aria-label") ?? "";
    const companyName = ariaLabel.replace(/^Company,\s*/, "").replace(/\.$/, "").trim();
    if (!companyName) continue;

    const nameEl = companyDiv.querySelector<HTMLElement>(COMPANY_LINK_SEL) ?? companyDiv;

    card.setAttribute(BADGE_ATTR, "");
    if (seen.has(nameEl)) continue;
    seen.add(nameEl);
    results.push({ element: card, companyNameElement: nameEl, companyName });
  }
  return results;
}

function scanLeftPanelDOM(): ScannedJob[] {
  const logos = document.querySelectorAll<HTMLElement>(COMPANY_LOGO_SEL);
  if (logos.length === 0) return [];

  const results: ScannedJob[] = [];
  const seenCards = new Set<HTMLElement>();

  for (const logo of logos) {
    // Walk up to the nearest role="button" ancestor — that's the job card.
    let card: HTMLElement | null = logo.parentElement;
    while (card && card !== document.body) {
      if (card.getAttribute("role") === "button") break;
      card = card.parentElement;
    }
    if (!card || card === document.body) continue;
    if (seenCards.has(card) || card.hasAttribute(BADGE_ATTR)) continue;
    seenCards.add(card);

    // Company name is the first <p> inside the card that contains only a text
    // node (no element children). Job title <p> has spans; location <p> comes
    // after; so the first plain-text <p> is reliably the company name.
    let nameEl: HTMLElement | null = null;
    for (const p of card.querySelectorAll<HTMLElement>("p")) {
      if (p.children.length === 0 && (p.textContent?.trim() ?? "").length > 0) {
        nameEl = p;
        break;
      }
    }
    if (!nameEl) continue;

    const companyName = nameEl.textContent!.trim();
    card.setAttribute(BADGE_ATTR, "");
    results.push({ element: card, companyNameElement: nameEl, companyName });
  }
  return results;
}

export function scanVisibleJobs(): ScannedJob[] {
  const guestResults = scanGuestDOM();
  if (guestResults.length > 0) return guestResults;
  // Logged-in view: scan both panels independently.
  return [...scanLeftPanelDOM(), ...scanRightPanelDOM()];
}
