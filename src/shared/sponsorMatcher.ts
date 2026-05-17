import { FUZZY_THRESHOLD } from "./constants";
import { normalize, tokenize } from "./normalizer";
import type { MatchResult, SponsorEntry } from "./types";

// tokenSet is precomputed once at index build time. Without this, the fuzzy
// loop allocated a fresh Set per sponsor per call — ~12,800 Sets per miss
// times ~3 misses per page = ~38k throw-away allocations per scan.
export interface IndexedSponsorEntry extends SponsorEntry {
  tokenSet: Set<string>;
}

export interface SponsorIndex {
  exactMap: Map<string, IndexedSponsorEntry>;
  entries: IndexedSponsorEntry[];
}

export function buildSponsorIndex(sponsors: SponsorEntry[]): SponsorIndex {
  const entries: IndexedSponsorEntry[] = sponsors.map((s) => ({
    ...s,
    tokenSet: new Set(s.tokens),
  }));
  const exactMap = new Map<string, IndexedSponsorEntry>();
  for (const sponsor of entries) {
    exactMap.set(sponsor.normalizedName, sponsor);
  }
  return { exactMap, entries };
}

export function isRecognizedSponsor(
  companyName: string,
  index: SponsorIndex,
): MatchResult {
  const normalizedInput = normalize(companyName);

  const exactMatch = index.exactMap.get(normalizedInput);
  if (exactMatch) {
    return {
      matched: true,
      confidence: "exact",
      sponsorName: exactMatch.originalName,
      score: 1.0,
    };
  }

  const inputTokens = tokenize(normalizedInput);
  if (inputTokens.length === 0) {
    return { matched: false, confidence: "none", sponsorName: null, score: 0 };
  }

  // Subset matching (Math.min denominator) is gated behind ≥2 input tokens.
  // A single-token input like "Tech" or "Apple" would otherwise score 1.0
  // against any sponsor whose normalized name happens to contain that token,
  // producing confident false positives. Single-token inputs can still match
  // via the exact map above; if they miss it, fuzzy uses sponsor.tokens.length
  // as the denominator (a stricter rule that single-token inputs cannot game).
  const allowSubsetMatch = inputTokens.length >= 2;

  const inputSet = new Set(inputTokens);
  let bestScore = 0;
  let bestSponsor: IndexedSponsorEntry | null = null;

  for (const sponsor of index.entries) {
    if (sponsor.tokens.length === 0) continue;
    let overlap = 0;
    for (const token of inputSet) {
      if (sponsor.tokenSet.has(token)) overlap++;
    }
    const denominator = allowSubsetMatch
      ? Math.min(inputTokens.length, sponsor.tokens.length)
      : sponsor.tokens.length;
    const score = overlap / denominator;
    if (score > bestScore) {
      bestScore = score;
      bestSponsor = sponsor;
    }
  }

  if (bestScore >= FUZZY_THRESHOLD && bestSponsor) {
    // score of 1.0 means every input token appeared in the sponsor — treat as
    // confirmed since the display name is just a shorter form of the registered name.
    const confidence = bestScore === 1.0 ? "exact" : "fuzzy";
    return {
      matched: true,
      confidence,
      sponsorName: bestSponsor.originalName,
      score: bestScore,
    };
  }

  return { matched: false, confidence: "none", sponsorName: null, score: bestScore };
}
