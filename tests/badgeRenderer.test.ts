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
  score: 0.85,
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

describe("renderBadge — matched (exact or fuzzy)", () => {
  it.each([
    ["exact", exactResult],
    ["fuzzy", fuzzyResult],
  ] as const)("%s match appends a badge", (_label, result) => {
    const job = makeJob();
    renderBadge(job, result);
    expect(job.companyNameElement.querySelector(".dvs-badge")).not.toBeNull();
  });

  it.each([
    ["exact", exactResult],
    ["fuzzy", fuzzyResult],
  ] as const)("%s match applies the confirmed CSS class", (_label, result) => {
    const job = makeJob();
    renderBadge(job, result);
    const badge = job.companyNameElement.querySelector(".dvs-badge");
    expect(badge?.classList.contains("dvs-badge--confirmed")).toBe(true);
  });

  it.each([
    ["exact", exactResult],
    ["fuzzy", fuzzyResult],
  ] as const)("%s match shows 'Visa Sponsor' text", (_label, result) => {
    const job = makeJob();
    renderBadge(job, result);
    const badge = job.companyNameElement.querySelector(".dvs-badge");
    expect(badge?.textContent).toContain("Visa Sponsor");
  });

  it.each([
    ["exact", exactResult],
    ["fuzzy", fuzzyResult],
  ] as const)("%s match sets a descriptive title", (_label, result) => {
    const job = makeJob();
    renderBadge(job, result);
    const badge = job.companyNameElement.querySelector<HTMLElement>(".dvs-badge");
    expect(badge?.title).toContain("Recognized IND sponsor");
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
    expect(job.companyNameElement.querySelectorAll(".dvs-badge")).toHaveLength(2);
  });
});
