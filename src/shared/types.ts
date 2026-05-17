export interface SponsorEntry {
  originalName: string;
  normalizedName: string;
  tokens: string[];
}

export interface MatchResult {
  matched: boolean;
  confidence: "exact" | "fuzzy" | "none";
  sponsorName: string | null;
  score: number;
}

export interface SponsorCache {
  sponsors: SponsorEntry[];
  fetchedAt: number;
  version: string;
}

export interface ExtensionStats {
  companiesScanned: number;
  sponsorsFound: number;
  lastSyncTimestamp: number;
}

export type MessageType =
  | { type: "GET_SPONSORS" }
  | { type: "REFRESH_SPONSORS" }
  | { type: "GET_STATS" }
  | { type: "UPDATE_STATS"; payload: Partial<ExtensionStats> };
