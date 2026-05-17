export const IND_REGISTER_URL =
  "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";

export const CACHE_KEY = "dvs_sponsor_cache";
export const STATS_KEY = "dvs_extension_stats";
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const LINKEDIN_SELECTORS = {
  // Confirmed via discover-selectors.mjs on 2026-05-17 (guest + logged-in):
  // .job-card-container and .artdeco-entity-lockup__subtitle are gone.
  // LinkedIn now uses the same base-search-card DOM for both views.
  jobCard: [".base-search-card", ".base-card"].join(", "),
  companyName: [".base-search-card__subtitle"].join(", "),
  jobTitle: [".base-search-card__title"].join(", "),
};

export const DEBOUNCE_MS = 200;
export const FUZZY_THRESHOLD = 0.8;
export const BADGE_ATTR = "data-dvs-checked";

export const DUTCH_SUFFIXES = [
  "bv",
  "b.v.",
  "nv",
  "n.v.",
  "holding",
  "group",
  "netherlands",
  "nederland", // Dutch spelling — appears throughout the IND register
  "international",
  "europe",
  "the netherlands",
];
