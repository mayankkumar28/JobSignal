import { FUZZY_THRESHOLD } from "./constants";
import { normalize, tokenize } from "./normalizer";
import type { MatchResult, SponsorEntry } from "./types";

export interface SponsorIndex {
  exactMap: Map<string, SponsorEntry>;
  entries: SponsorEntry[];
}

export function buildSponsorIndex(sponsors: SponsorEntry[]): SponsorIndex {
  const exactMap = new Map<string, SponsorEntry>();
  for (const sponsor of sponsors) {
    exactMap.set(sponsor.normalizedName, sponsor);
  }
  return { exactMap, entries: sponsors };
}

export function isRecognizedSponsor(
  companyName: string,
  index: SponsorIndex,
  mode: "strict" | "fuzzy"
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

  if (mode === "strict") {
    return { matched: false, confidence: "none", sponsorName: null, score: 0 };
  }

  const inputTokens = tokenize(normalizedInput);
  if (inputTokens.length === 0) {
    return { matched: false, confidence: "none", sponsorName: null, score: 0 };
  }

  const inputSet = new Set(inputTokens);
  let bestScore = 0;
  let bestSponsor: SponsorEntry | null = null;

  for (const sponsor of index.entries) {
    if (sponsor.tokens.length === 0) continue;
    const sponsorSet = new Set(sponsor.tokens);
    let overlap = 0;
    for (const token of inputSet) {
      if (sponsorSet.has(token)) overlap++;
    }
    const score = overlap / Math.max(inputTokens.length, sponsor.tokens.length);
    if (score > bestScore) {
      bestScore = score;
      bestSponsor = sponsor;
    }
  }

  if (bestScore >= FUZZY_THRESHOLD && bestSponsor) {
    return {
      matched: true,
      confidence: "fuzzy",
      sponsorName: bestSponsor.originalName,
      score: bestScore,
    };
  }

  return { matched: false, confidence: "none", sponsorName: null, score: bestScore };
}
