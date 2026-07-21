import { addUtcDays, toIsoDate } from "../utils/dateRange";

// Reduces the two precomputed chill products (observed daily portions + the
// Oct1-anchored cumulative percentile band) into one per-day series the chill
// chart can render directly. The observed file gives *daily* increments, so we
// accumulate here; the band file is *already cumulative* and keyed by
// day-of-season, so it aligns to the observed series by index-from-Oct-1.

export interface ChillObservedRow {
  date: string;
  dailyPortions: number;
}

// One day of the Oct1-anchored cumulative percentile band. Null where the file
// reported `nan` (typically the tail), kept index-aligned to day-of-season.
export interface ChillBandDay {
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

export interface ChillClimatologyDay {
  /** Real ISO date in the current dormant season (seasonStart + index days). */
  date: string;
  dailyPortions: number | null;
  /** Observed cumulative portions; null past the last observed day. */
  cumulativePortions: number | null;
  bandP10: number | null;
  bandP50: number | null;
  bandP90: number | null;
}

export interface ChillClimatology {
  days: ChillClimatologyDay[];
  seasonStart: string;
  baselineLabel: string;
  /** Last observed date with data, or null when no observed file loaded. */
  observedThrough: string | null;
  /** Cumulative portions through `observedThrough` (the "accrued so far" total). */
  currentCumulative: number | null;
  hasObserved: boolean;
  hasBand: boolean;
}

export function buildChillClimatology(input: {
  observed: ChillObservedRow[];
  band: ChillBandDay[];
  seasonStart: string;
  baselineLabel: string;
}): ChillClimatology {
  const { observed, band, seasonStart, baselineLabel } = input;

  const sortedObserved = [...observed].sort((a, b) => (a.date < b.date ? -1 : 1));
  const dailyByDate = new Map(sortedObserved.map((row) => [row.date, row.dailyPortions]));
  const cumulativeByDate = new Map<string, number>();
  let cumulative = 0;
  let observedThrough: string | null = null;
  for (const row of sortedObserved) {
    cumulative += row.dailyPortions;
    cumulativeByDate.set(row.date, Number(cumulative.toFixed(2)));
    observedThrough = row.date;
  }

  // The band spans the whole season; observed stops at the data lag. Use the
  // longer of the two as the day axis so the normal band still draws past today.
  const length = Math.max(band.length, sortedObserved.length);
  const start = new Date(`${seasonStart}T00:00:00Z`);
  const days: ChillClimatologyDay[] = [];
  for (let index = 0; index < length; index += 1) {
    const date = toIsoDate(addUtcDays(start, index));
    const bandDay = band[index];
    days.push({
      date,
      dailyPortions: dailyByDate.get(date) ?? null,
      cumulativePortions: cumulativeByDate.get(date) ?? null,
      bandP10: bandDay?.p10 ?? null,
      bandP50: bandDay?.p50 ?? null,
      bandP90: bandDay?.p90 ?? null,
    });
  }

  return {
    days,
    seasonStart,
    baselineLabel,
    observedThrough,
    currentCumulative: observedThrough ? Number(cumulative.toFixed(2)) : null,
    hasObserved: sortedObserved.length > 0,
    hasBand: band.some((day) => day.p50 !== null),
  };
}
