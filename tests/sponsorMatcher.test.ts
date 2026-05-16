import { describe, it, expect, beforeAll } from "vitest";
import { buildSponsorIndex, isRecognizedSponsor, SponsorIndex } from "../src/shared/sponsorMatcher";
import { normalize, tokenize } from "../src/shared/normalizer";
import type { SponsorEntry } from "../src/shared/types";
import rawNames from "./fixtures/ind-sample.json";

function buildEntries(names: string[]): SponsorEntry[] {
  return names.map((originalName) => {
    const normalizedName = normalize(originalName);
    return { originalName, normalizedName, tokens: tokenize(normalizedName) };
  });
}

let index: SponsorIndex;

beforeAll(() => {
  index = buildSponsorIndex(buildEntries(rawNames));
});

describe("isRecognizedSponsor — strict mode", () => {
  const strictCases: [string, "exact" | "none"][] = [
    ["Booking.com", "exact"],
    ["Booking.com B.V.", "exact"],
    ["UBER", "exact"],
    ["Uber Netherlands", "exact"],
    ["Adyen", "exact"],
    ["Fake Corp", "none"],
    ["", "none"],
  ];

  it.each(strictCases)('"%s" → %s', (input, expectedConfidence) => {
    const result = isRecognizedSponsor(input, index, "strict");
    expect(result.confidence).toBe(expectedConfidence);
    expect(result.matched).toBe(expectedConfidence !== "none");
    if (expectedConfidence === "exact") {
      expect(result.score).toBe(1.0);
      expect(result.sponsorName).not.toBeNull();
    }
  });
});

describe("isRecognizedSponsor — fuzzy mode", () => {
  it('"ASML Holding" hits exact (suffix stripped before lookup)', () => {
    const result = isRecognizedSponsor("ASML Holding", index, "fuzzy");
    expect(result.confidence).toBe("exact");
    expect(result.matched).toBe(true);
  });

  it('"Book" scores below threshold — no match', () => {
    // "Book" does not overlap with "booking com" tokens (no shared token)
    const result = isRecognizedSponsor("Book", index, "fuzzy");
    expect(result.confidence).toBe("none");
    expect(result.matched).toBe(false);
  });

  it('"Fake Corp" returns none even in fuzzy mode', () => {
    const result = isRecognizedSponsor("Fake Corp", index, "fuzzy");
    expect(result.confidence).toBe("none");
    expect(result.matched).toBe(false);
  });
});

describe("buildSponsorIndex", () => {
  it("builds exactMap with all normalized names", () => {
    expect(index.exactMap.size).toBe(rawNames.length);
  });

  it("entries array has same length as input", () => {
    expect(index.entries.length).toBe(rawNames.length);
  });

  it("preserves originalName on each entry", () => {
    const booking = index.exactMap.get("booking com");
    expect(booking?.originalName).toBe("Booking.com B.V.");
  });
});
