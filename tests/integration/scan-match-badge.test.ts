// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { scanVisibleJobs } from "../../src/content/linkedinScanner";
import { renderBadge } from "../../src/content/badgeRenderer";
import { buildSponsorIndex, isRecognizedSponsor } from "../../src/shared/sponsorMatcher";
import { buildSponsorCache } from "../../src/shared/sponsorFetcher";
import sponsorFixtureRaw from "../fixtures/data/sponsors-small.json";

const fixtureHtml = readFileSync(
  resolve(__dirname, "../fixtures/pages/linkedin-jobs.html"),
  "utf-8",
);

const cache = buildSponsorCache(sponsorFixtureRaw as string[]);
const index = buildSponsorIndex(cache.sponsors);

beforeEach(() => {
  document.body.innerHTML = fixtureHtml;
});

describe("scan → match → badge pipeline", () => {
  it("injects a confirmed badge for an exact-match sponsor", () => {
    const jobs = scanVisibleJobs();
    const booking = jobs.find((j) => j.companyName === "Booking.com")!;
    renderBadge(booking, isRecognizedSponsor(booking.companyName, index));
    expect(booking.companyNameElement.querySelector(".dvs-badge--confirmed")).not.toBeNull();
  });

  it("does not badge an unknown company", () => {
    const jobs = scanVisibleJobs();
    const fake = jobs.find((j) => j.companyName === "FakeStartup Inc.")!;
    renderBadge(fake, isRecognizedSponsor(fake.companyName, index));
    expect(fake.companyNameElement.querySelector(".dvs-badge")).toBeNull();
  });

  it("second scan returns nothing — all cards already stamped", () => {
    scanVisibleJobs().forEach((j) =>
      renderBadge(j, isRecognizedSponsor(j.companyName, index)),
    );
    expect(scanVisibleJobs()).toHaveLength(0);
  });

  it("scans 9 company names from the 10-card fixture (1 card has empty name)", () => {
    expect(scanVisibleJobs()).toHaveLength(9);
  });

  it("UBER normalises to 'uber' and exact-matches 'Uber Netherlands B.V.'", () => {
    const jobs = scanVisibleJobs();
    const uber = jobs.find((j) => j.companyName === "UBER")!;
    const result = isRecognizedSponsor(uber.companyName, index);
    expect(result.matched).toBe(true);
    expect(result.confidence).toBe("exact");
  });

  it("TomTom N.V. does NOT match TomTom Global Content B.V. — they are different sponsor entities", () => {
    // Tightened policy: "TomTom N.V." normalizes to single token "tomtom"; the
    // fixture only registers "TomTom Global Content B.V." (3-token sponsor).
    // Under the ≥2-token subset rule, this no longer produces a misleading badge.
    const jobs = scanVisibleJobs();
    const tomtom = jobs.find((j) => j.companyName === "TomTom N.V.")!;
    const result = isRecognizedSponsor(tomtom.companyName, index);
    expect(result.matched).toBe(false);
  });

  it("no duplicate badges when called twice on the same fixture", () => {
    const jobs = scanVisibleJobs();
    jobs.forEach((j) => renderBadge(j, isRecognizedSponsor(j.companyName, index)));
    // Second scan should find nothing — BADGE_ATTR prevents re-processing
    const jobs2 = scanVisibleJobs();
    expect(jobs2).toHaveLength(0);
    // Confirm each name element has exactly one badge
    document.querySelectorAll(".dvs-badge").forEach((badge) => {
      const parent = badge.parentElement!;
      expect(parent.querySelectorAll(".dvs-badge")).toHaveLength(1);
    });
  });

  it("every card in the fixture gets BADGE_ATTR after scan (prevents re-scan)", () => {
    scanVisibleJobs().forEach((j) =>
      renderBadge(j, isRecognizedSponsor(j.companyName, index)),
    );
    // All 9 scannable cards (10 total minus 1 with empty name) should be stamped.
    const stamped = document.querySelectorAll("[data-dvs-checked]");
    expect(stamped.length).toBe(9);
  });
});
