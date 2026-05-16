// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderBadge } from "../src/content/badgeRenderer";
import type { ScannedJob } from "../src/content/linkedinScanner";
import type { MatchResult } from "../src/shared/types";

function makeJob(companyName = "Acme B.V."): ScannedJob {
  const element = document.createElement("div");
  element.className = "job-card-container";
  const companyNameElement = document.createElement("div");
  companyNameElement.className = "job-card-container__primary-description";
  companyNameElement.textContent = companyName;
  element.appendChild(companyNameElement);
  document.body.appendChild(element);
  return { element, companyNameElement, companyName };
}

const exactResult: MatchResult = {
  matched: true,
  confidence: "exact",
  sponsorName: "Acme B.V.",
  score: 1.0,
};

const fuzzyResult: MatchResult = {
  matched: true,
  confidence: "fuzzy",
  sponsorName: "Acme B.V.",
  score: 0.8,
};

const noneResult: MatchResult = {
  matched: false,
  confidence: "none",
  sponsorName: null,
  score: 0,
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("renderBadge — exact match", () => {
  it("appends a badge to the company name element", () => {
    const job = makeJob();
    renderBadge(job, exactResult);
    expect(job.companyNameElement.querySelector(".dvs-badge")).not.toBeNull();
  });

  it("applies the confirmed CSS class", () => {
    const job = makeJob();
    renderBadge(job, exactResult);
    const badge = job.companyNameElement.querySelector(".dvs-badge");
    expect(badge?.classList.contains("dvs-badge--confirmed")).toBe(true);
  });

  it("sets the correct text content", () => {
    const job = makeJob();
    renderBadge(job, exactResult);
    const badge = job.companyNameElement.querySelector(".dvs-badge");
    expect(badge?.textContent).toContain("Visa Sponsor");
  });

  it("sets a descriptive title attribute", () => {
    const job = makeJob();
    renderBadge(job, exactResult);
    const badge = job.companyNameElement.querySelector<HTMLElement>(".dvs-badge");
    expect(badge?.title).toContain("Recognized IND sponsor");
  });
});

describe("renderBadge — fuzzy match", () => {
  it("appends a badge to the company name element", () => {
    const job = makeJob();
    renderBadge(job, fuzzyResult);
    expect(job.companyNameElement.querySelector(".dvs-badge")).not.toBeNull();
  });

  it("applies the uncertain CSS class", () => {
    const job = makeJob();
    renderBadge(job, fuzzyResult);
    const badge = job.companyNameElement.querySelector(".dvs-badge");
    expect(badge?.classList.contains("dvs-badge--uncertain")).toBe(true);
  });

  it("sets the correct text content", () => {
    const job = makeJob();
    renderBadge(job, fuzzyResult);
    const badge = job.companyNameElement.querySelector(".dvs-badge");
    expect(badge?.textContent).toContain("Possible Sponsor");
  });

  it("sets a verify-manually title", () => {
    const job = makeJob();
    renderBadge(job, fuzzyResult);
    const badge = job.companyNameElement.querySelector<HTMLElement>(".dvs-badge");
    expect(badge?.title).toContain("verify manually");
  });
});

describe("renderBadge — no match", () => {
  it("does not append any element", () => {
    const job = makeJob();
    const before = job.companyNameElement.childElementCount;
    renderBadge(job, noneResult);
    expect(job.companyNameElement.childElementCount).toBe(before);
  });
});

describe("renderBadge — idempotency guard", () => {
  it("calling twice appends two badges (scanner BADGE_ATTR prevents duplicates upstream)", () => {
    const job = makeJob();
    renderBadge(job, exactResult);
    renderBadge(job, exactResult);
    // badgeRenderer itself doesn't deduplicate — the scanner's BADGE_ATTR does
    expect(job.companyNameElement.querySelectorAll(".dvs-badge")).toHaveLength(2);
  });
});
