import type { MatchResult } from "../shared/types";
import type { ScannedJob } from "./linkedinScanner";

export function renderBadge(job: ScannedJob, result: MatchResult): void {
  if (result.confidence === "none") return;

  const badge = document.createElement("span");

  if (result.confidence === "exact") {
    badge.textContent = "🇳🇱 Visa Sponsor";
    badge.className = "dvs-badge dvs-badge--confirmed";
    badge.title = "Recognized IND sponsor for Netherlands Highly Skilled Migrant visa";
  } else {
    badge.textContent = "⚠ Possible Sponsor";
    badge.className = "dvs-badge dvs-badge--uncertain";
    badge.title = "Possible IND sponsor match—verify manually";
  }

  job.companyNameElement.appendChild(badge);
}
