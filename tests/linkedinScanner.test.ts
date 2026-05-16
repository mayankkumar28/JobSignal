// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { scanVisibleJobs } from "../src/content/linkedinScanner";
import { BADGE_ATTR } from "../src/shared/constants";

const fixtureHtml = readFileSync(
  resolve(__dirname, "fixtures/linkedin-dom.html"),
  "utf-8",
);

beforeEach(() => {
  document.body.innerHTML = fixtureHtml;
});

describe("scanVisibleJobs", () => {
  it("returns only unprocessed cards with a company name", () => {
    const jobs = scanVisibleJobs();
    // Cards 1, 2, 6 are valid; 3 is already marked; 4 has no name el; 5 is whitespace
    expect(jobs).toHaveLength(3);
  });

  it("extracts the correct company names", () => {
    const names = scanVisibleJobs().map((j) => j.companyName);
    expect(names).toEqual(["Booking.com", "ASML Holding N.V.", "Adyen"]);
  });

  it("marks each processed card with BADGE_ATTR", () => {
    scanVisibleJobs();
    const marked = document.querySelectorAll(`[${BADGE_ATTR}]`);
    // Cards 1, 2, 6 are newly marked plus card 3 was already marked = 4 total
    expect(marked).toHaveLength(4);
  });

  it("skips cards that already have BADGE_ATTR", () => {
    // First pass marks 3 cards
    const first = scanVisibleJobs();
    expect(first).toHaveLength(3);
    // Second pass finds nothing new
    const second = scanVisibleJobs();
    expect(second).toHaveLength(0);
  });

  it("returns a ScannedJob with element, companyNameElement, and companyName", () => {
    const [job] = scanVisibleJobs();
    expect(job.element).toBeInstanceOf(HTMLElement);
    expect(job.companyNameElement).toBeInstanceOf(HTMLElement);
    expect(typeof job.companyName).toBe("string");
    expect(job.companyName.length).toBeGreaterThan(0);
  });

  it("skips cards with no company name element", () => {
    document.body.innerHTML = `
      <div class="job-card-container">
        <h3 class="job-card-list__title">Designer</h3>
      </div>`;
    expect(scanVisibleJobs()).toHaveLength(0);
  });

  it("skips cards with empty or whitespace-only company names", () => {
    document.body.innerHTML = `
      <div class="job-card-container">
        <div class="job-card-container__primary-description">   </div>
      </div>`;
    expect(scanVisibleJobs()).toHaveLength(0);
  });

  it("returns empty array when no job cards exist", () => {
    document.body.innerHTML = "<main><p>No jobs here</p></main>";
    expect(scanVisibleJobs()).toHaveLength(0);
  });
});
