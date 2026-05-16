import { IND_REGISTER_URL } from "./constants";
import { normalize, tokenize } from "./normalizer";
import type { SponsorCache, SponsorEntry } from "./types";
import bundledSponsors from "../data/sponsors-snapshot.json";

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchSponsorsFromIND(): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(IND_REGISTER_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const names = parseSponsorsFromHTML(html);
    if (names.length === 0) {
      throw new Error("IND parse returned 0 names — page structure may have changed");
    }
    return names;
  } finally {
    clearTimeout(timer);
  }
}

// Regex-based parser: extracts text from <th scope="row">…</th> cells.
// Handles HTML entities; works in both browser and Node contexts.
export function parseSponsorsFromHTML(html: string): string[] {
  const names: string[] = [];
  const pattern = /<th[^>]+scope="row"[^>]*>([\s\S]*?)<\/th>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (raw.length > 0) {
      names.push(raw);
    }
  }
  return names;
}

export function buildSponsorCache(rawNames: string[]): SponsorCache {
  const sponsors: SponsorEntry[] = [];
  for (const originalName of rawNames) {
    const trimmed = originalName.trim();
    if (!trimmed) continue;
    const normalizedName = normalize(trimmed);
    if (!normalizedName) continue;
    sponsors.push({ originalName: trimmed, normalizedName, tokens: tokenize(normalizedName) });
  }
  return { sponsors, fetchedAt: Date.now(), version: "1.0" };
}

export async function fetchAndBuildCache(): Promise<SponsorCache> {
  let rawNames: string[];
  try {
    rawNames = await fetchSponsorsFromIND();
  } catch (err) {
    console.warn("[DVS] IND fetch failed, using bundled fallback:", err);
    rawNames = bundledSponsors as string[];
  }
  return buildSponsorCache(rawNames);
}
