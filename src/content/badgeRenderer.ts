import type { MatchResult } from "../shared/types";
import type { ScannedJob } from "./linkedinScanner";

export function renderBadge(job: ScannedJob, result: MatchResult): void {
  if (!result.matched) return;

  const badge = document.createElement("span");
  badge.textContent = "🇳🇱 Visa Sponsor";
  badge.className = "dvs-badge dvs-badge--confirmed";
  badge.title = "Recognized IND sponsor for Netherlands Highly Skilled Migrant visa";

  job.companyNameElement.appendChild(badge);
}
