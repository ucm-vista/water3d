// Precomputed winter-chill products from the Climate Toolbox (University of
// Idaho / Northwest Knowledge Network). They are served by the same generic
// netCDF-extraction endpoint as gridMET and reached through the same
// `/api/gridmet` proxy, so no new upstream/proxy is required. Two products:
//
//  - OBSERVED: daily chill for the current dormant season, precomputed with the
//    Dynamic Model (Fishman–Erez) and reported in Chill Portions. Daily
//    increments (Oct 1 → spring), cumulatively summed client-side. The file is
//    year-versioned (`chill_portion_<springYear>.nc`) and lives under a testing
//    path, so the client Dynamic Model (calcs/dynamicModel.ts) stays as a
//    fallback when it is unavailable.
//  - NORMAL BAND: Oct1-anchored *cumulative* percentile curves (p10/p50/p90) —
//    the "normal" chill envelope. Baseline 1979–2022. These are keyed by
//    day-of-season (a placeholder climatological year), NOT calendar date, so
//    they align to the observed series by index-from-Oct-1.
//
// These replace the client-side Dynamic Model for the chill view's observed line
// and add a historical band the app did not previously have. See
// water3d-api-integration-and-performance.md §2 for the source request shapes.

export const chillToolboxConfig = {
  /** Portions baseline embedded in the percentile files' metadata. */
  bandBaselineLabel: "1979–2022",
  /** Month-day the precomputed products anchor chill accumulation to. */
  seasonStartMonthDay: "10-01",
  /** Percentile columns fetched for the normal band (inner P30/P70 exist too). */
  bandPercentiles: ["p10", "p50", "p90"] as const,
} as const;

// The dormant season spans two calendar years (Oct → spring). The observed file
// is named for the year the season *ends* in: Oct–Dec belong to next spring's
// file, Jan–Sep to the current one.
export function chillSeasonSpringYear(todayIso: string): number {
  const [year, month] = todayIso.split("-").map(Number);
  return month >= 10 ? year + 1 : year;
}

/** ISO date the chill season starts: Oct 1 of the autumn before `springYear`. */
export function chillSeasonStartDate(springYear: number): string {
  return `${springYear - 1}-${chillToolboxConfig.seasonStartMonthDay}`;
}

export function observedChillDataPath(springYear: number): string {
  return `PATH_TO_TESTING/CHILL/chill_portion_${springYear}.nc`;
}

export function chillBandDataPath(percentile: string): string {
  return `PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillportion_Oct1_dailyPercentiles_${percentile}.nc`;
}
