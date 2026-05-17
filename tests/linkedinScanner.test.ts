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
      <div class="base-card base-search-card">
        <h3 class="base-search-card__title">Designer</h3>
      </div>`;
    expect(scanVisibleJobs()).toHaveLength(0);
  });

  it("skips cards with empty or whitespace-only company names", () => {
    document.body.innerHTML = `
      <div class="base-card base-search-card">
        <h4 class="base-search-card__subtitle">   </h4>
      </div>`;
    expect(scanVisibleJobs()).toHaveLength(0);
  });

  it("returns empty array when no job cards exist", () => {
    document.body.innerHTML = "<main><p>No jobs here</p></main>";
    expect(scanVisibleJobs()).toHaveLength(0);
  });
});

// ── Logged-in DOM: left panel (company logo + role="button" card) ─────────────
describe("scanVisibleJobs — logged-in left panel (company logo cards)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <div role="button" tabindex="0">
          <img src="https://media.licdn.com/company-logo/tomtom.png" alt="TomTom logo" />
          <div>
            <p><span>Backend Engineer</span></p>
            <p>TomTom</p>
            <p>Amsterdam</p>
          </div>
        </div>
        <div role="button" tabindex="0">
          <img src="https://media.licdn.com/company-logo/adyen.png" alt="Adyen logo" />
          <div>
            <p><span>Frontend Engineer</span></p>
            <p>Adyen N.V.</p>
            <p>Amsterdam</p>
          </div>
        </div>
        <div role="button" tabindex="0">
          <!-- no company logo — should be skipped -->
          <div>
            <p><span>Designer</span></p>
          </div>
        </div>
      </div>`;
  });

  it("scans both left-panel cards that have a company logo", () => {
    expect(scanVisibleJobs()).toHaveLength(2);
  });

  it("extracts company name from the first plain-text <p>", () => {
    const names = scanVisibleJobs().map((j) => j.companyName);
    expect(names).toContain("TomTom");
    expect(names).toContain("Adyen N.V.");
  });

  it("sets companyNameElement to the plain-text <p>", () => {
    const [job] = scanVisibleJobs();
    expect(job.companyNameElement.tagName).toBe("P");
    expect(job.companyNameElement.children.length).toBe(0);
  });

  it("skips cards with no company logo", () => {
    const jobs = scanVisibleJobs();
    expect(jobs.every((j) => j.companyName.length > 0)).toBe(true);
  });
});

// ── Logged-in DOM: right panel (B1 — ARIA label) ─────────────────────────────
describe("scanVisibleJobs — logged-in right panel (ARIA label)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-detail-panel="1">
        <a href="/jobs/view/999">Software Engineer II</a>
        <div aria-label="Company, TomTom.">
          <a href="/company/tomtom/life/">TomTom</a>
        </div>
      </div>`;
  });

  it("extracts company name from the ARIA label", () => {
    const [job] = scanVisibleJobs();
    expect(job.companyName).toBe("TomTom");
  });

  it("sets companyNameElement to the inner company anchor", () => {
    const [job] = scanVisibleJobs();
    expect((job.companyNameElement as HTMLAnchorElement).href).toContain("/company/tomtom/");
  });
});
