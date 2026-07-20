// Cache freshness policy (strict TTL): a query serves its persisted/in-memory
// value only while within `staleTime`; past that it refetches and the UI shows a
// loader rather than stale data. `PERSIST_MAX_AGE` bounds how long any entry may
// be restored from localStorage across reloads. Bump `CACHE_BUSTER` whenever the
// cached data shape changes to invalidate every persisted entry at once.

// v3: ClimatologyStats gained P10/P50/P90 percentile fields (GDD band). Pre-v3
// persisted stats have only the mean, so the band/P50 silently render nothing
// until the stale entry is dropped.
export const CACHE_BUSTER = "w3d-cache-v3";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const TTL = {
  // Current season = gridMET history (lags ~2 days) + Climate Toolbox forecast
  // (re-issued daily). Short window so the live tail refreshes.
  seasonWeather: 6 * HOUR,
  // Open-Meteo chill history runs through today, so refresh a couple times a day.
  chillWeather: 12 * HOUR,
  // Prior full calendar years are immutable once published.
  priorYearWeather: 30 * DAY,
  // The 30-yr climatology window only shifts at year boundaries.
  climatologyWeather: 30 * DAY,
  // The current year as an overlay still accumulates, so keep it short.
  currentYearWeather: 6 * HOUR,
} as const;

// Restore window for the localStorage-persisted cache. Set to the longest TTL so
// a restored entry can never outlive its own freshness policy.
export const PERSIST_MAX_AGE = TTL.priorYearWeather;

// Keep resolved queries in memory long enough that switching views/fields within
// a session is instant (no refetch, no recompute).
export const GC_TIME = DAY;
