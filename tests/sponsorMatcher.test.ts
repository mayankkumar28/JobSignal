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

describe("isRecognizedSponsor", () => {
  const exactCases: [string, "exact" | "none"][] = [
    ["Booking.com", "exact"],
    ["Booking.com B.V.", "exact"],
    ["UBER", "exact"],
    ["Uber Netherlands", "exact"],
    ["Adyen", "exact"],
    ["Fake Corp", "none"],
    ["", "none"],
  ];

  it.each(exactCases)('"%s" → %s (exact or none)', (input, expectedConfidence) => {
    const result = isRecognizedSponsor(input, index);
    expect(result.confidence).toBe(expectedConfidence);
    expect(result.matched).toBe(expectedConfidence !== "none");
    if (expectedConfidence === "exact") {
      expect(result.score).toBe(1.0);
      expect(result.sponsorName).not.toBeNull();
    }
  });

  it('"ASML Holding" hits exact (suffix stripped before lookup)', () => {
    const result = isRecognizedSponsor("ASML Holding", index);
    expect(result.confidence).toBe("exact");
    expect(result.matched).toBe(true);
  });

  it('"Book" scores below threshold — no match', () => {
    const result = isRecognizedSponsor("Book", index);
    expect(result.confidence).toBe("none");
    expect(result.matched).toBe(false);
  });

  it('"Fake Corp" returns none', () => {
    const result = isRecognizedSponsor("Fake Corp", index);
    expect(result.confidence).toBe("none");
    expect(result.matched).toBe(false);
  });

  it('"Hadrian" alone (single token) no longer matches "Hadrian Security B.V."', () => {
    // Tightened policy: single-token inputs cannot use the subset denominator.
    // A bare "Hadrian" is ambiguous (could be any Hadrian-prefixed company).
    const result = isRecognizedSponsor("Hadrian", index);
    expect(result.matched).toBe(false);
    expect(result.confidence).toBe("none");
  });

  it('"Hadrian Security" (≥2 tokens) still matches "Hadrian Security B.V."', () => {
    const result = isRecognizedSponsor("Hadrian Security", index);
    expect(result.matched).toBe(true);
    expect(result.confidence).toBe("exact");
    expect(result.score).toBe(1.0);
    expect(result.sponsorName).toBe("Hadrian Security B.V.");
  });

  it('single-token generic word does not match a multi-token sponsor (no false positive)', () => {
    // "Security" appears as a token inside "Hadrian Security B.V." but should
    // never match on its own. Before the ≥2-token gate, this scored 1.0/1 = 1.0.
    const result = isRecognizedSponsor("Security", index);
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
