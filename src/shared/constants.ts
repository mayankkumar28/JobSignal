export const IND_REGISTER_URL =
  "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";

export const CACHE_KEY = "dvs_sponsor_cache";
export const STATS_KEY = "dvs_extension_stats";
export const SETTINGS_KEY = "dvs_extension_settings";
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const LINKEDIN_SELECTORS = {
  jobCard: ".job-card-container, .jobs-search-results__list-item",
  companyName:
    ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle",
  jobTitle: ".job-card-list__title",
};

export const DEBOUNCE_MS = 200;
export const FUZZY_THRESHOLD = 0.75;
export const BADGE_ATTR = "data-dvs-checked";

export const DUTCH_SUFFIXES = [
  "bv",
  "b.v.",
  "nv",
  "n.v.",
  "holding",
  "group",
  "netherlands",
  "international",
  "europe",
  "the netherlands",
];
