import { DUTCH_SUFFIXES } from "./constants";

export function normalize(name: string): string {
  // NFKD decomposes accented chars (é → e + ́); \p{M} strips the combining marks.
  // Without this, the [^a-z0-9\s] replacement would discard accented letters and
  // mangle Dutch/EU names ("Société" → "soci t" rather than "societe").
  let s = name.normalize("NFKD").replace(/\p{M}/gu, "");
  // NFKD does not decompose precomposed ligatures; map the common European ones
  // by hand so they survive the ASCII filter below.
  s = s
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/[øØ]/g, "o")
    .replace(/ß/g, "ss");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = stripSuffixes(s);
  return s;
}

export function tokenize(normalizedName: string): string[] {
  return normalizedName.split(" ").filter((t) => t.length > 0);
}

function stripSuffixes(s: string): string {
  let prev = "";
  while (prev !== s) {
    prev = s;
    for (const suffix of DUTCH_SUFFIXES) {
      // suffix may itself contain spaces, so normalize it the same way
      const normalizedSuffix = suffix
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (s === normalizedSuffix) break; // don't strip if it's all that's left
      if (s.endsWith(" " + normalizedSuffix)) {
        s = s.slice(0, s.length - normalizedSuffix.length - 1).trimEnd();
      }
    }
  }
  return s;
}
