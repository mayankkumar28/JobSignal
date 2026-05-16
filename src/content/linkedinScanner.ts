import { BADGE_ATTR, LINKEDIN_SELECTORS } from "../shared/constants";

export interface ScannedJob {
  element: HTMLElement;
  companyNameElement: HTMLElement;
  companyName: string;
}

export function scanVisibleJobs(): ScannedJob[] {
  const cards = document.querySelectorAll<HTMLElement>(LINKEDIN_SELECTORS.jobCard);
  const results: ScannedJob[] = [];

  for (const card of cards) {
    if (card.hasAttribute(BADGE_ATTR)) continue;

    const companyNameElement = card.querySelector<HTMLElement>(LINKEDIN_SELECTORS.companyName);
    if (!companyNameElement) continue;

    const companyName = companyNameElement.textContent?.trim() ?? "";
    if (!companyName) continue;

    card.setAttribute(BADGE_ATTR, "");
    results.push({ element: card, companyNameElement, companyName });
  }

  return results;
}
