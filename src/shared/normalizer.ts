import { DUTCH_SUFFIXES } from "./constants";

export function normalize(name: string): string {
  let s = name.toLowerCase();
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
