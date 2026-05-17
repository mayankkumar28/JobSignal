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

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

// Single-pass HTML entity decoder. Handles &amp;/&quot;/&apos;/&lt;/&gt;/&nbsp;,
// numeric (&#NNN;) and hex (&#xNNN;) forms. Other named entities (&eacute; etc.)
// pass through unchanged — the IND register uses UTF-8 directly for accented chars.
export function decodeEntities(s: string): string {
  return s.replace(
    /&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g,
    (match, hex, dec, name) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (dec) return String.fromCodePoint(parseInt(dec, 10));
      if (name && NAMED_ENTITIES[name]) return NAMED_ENTITIES[name];
      return match;
    },
  );
}

// Regex-based parser: extracts text from <th scope="row">…</th> cells.
// Works in both service-worker and Node contexts (no DOMParser dependency).
export function parseSponsorsFromHTML(html: string): string[] {
  const names: string[] = [];
  const pattern = /<th[^>]+scope="row"[^>]*>([\s\S]*?)<\/th>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = decodeEntities(match[1]).trim();
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
