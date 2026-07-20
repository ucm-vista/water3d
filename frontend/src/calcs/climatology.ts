import { dailyGdd } from "./gdd";
import type { WeatherRecord } from "../types/domain";

// Per-calendar-day climatological statistics, aligned to the season biofix.
// Cumulative values restart at `alignStartMonthDay` within each source year, so
// the resulting curves overlay the current season the same way the old per-year
// baseline snapshots did.
export interface ClimatologyDayStats {
  gddCumMean: number;
  gddCumP10: number;
  gddCumP50: number;
  gddCumP90: number;
  gddDailyMean: number;
  etoCumMean: number;
  etoCumP10: number;
  etoCumP50: number;
  etoCumP90: number;
  precipCumMean: number;
  precipCumP10: number;
  precipCumP50: number;
  precipCumP90: number;
}

// Serializable (persisted via the query cache), so a plain record — not a Map.
export interface ClimatologyStats {
  byMonthDay: Record<string, ClimatologyDayStats>;
  startYear: number;
  endYear: number;
  /** Source years that actually contributed records (gaps in gridMET shrink this). */
  yearsWithData: number;
}

export interface ClimatologyOptions {
  startYear: number;
  endYear: number;
  gddBaseTempC: number;
  gddUpperTempC: number;
  /** "MM-DD" the cumulative curves restart at (the season biofix). */
  alignStartMonthDay: string;
}

export function buildClimatologyStats(records: WeatherRecord[], options: ClimatologyOptions): ClimatologyStats {
  const { startYear, endYear, gddBaseTempC, gddUpperTempC, alignStartMonthDay } = options;
  const crop = { tBaseC: gddBaseTempC, tUpperC: gddUpperTempC };

  const byYear = new Map<number, WeatherRecord[]>();
  for (const record of records) {
    const year = Number(record.date.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    const list = byYear.get(year) ?? [];
    list.push(record);
    byYear.set(year, list);
  }

  const buckets = new Map<string, { gddCum: number[]; gddDaily: number[]; etoCum: number[]; precipCum: number[] }>();

  for (const yearRecords of byYear.values()) {
    let gddCum = 0;
    let etoCum = 0;
    let precipCum = 0;
    for (const record of [...yearRecords].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const monthDay = record.date.slice(5);
      if (monthDay < alignStartMonthDay) continue;
      const gdd = dailyGdd(record, crop);
      gddCum += gdd;
      etoCum += record.etoMm ?? 0;
      precipCum += record.precipMm ?? 0;
      const bucket = buckets.get(monthDay) ?? { gddCum: [], gddDaily: [], etoCum: [], precipCum: [] };
      bucket.gddCum.push(gddCum);
      bucket.gddDaily.push(gdd);
      bucket.etoCum.push(etoCum);
      bucket.precipCum.push(precipCum);
      buckets.set(monthDay, bucket);
    }
  }

  const byMonthDay: Record<string, ClimatologyDayStats> = {};
  for (const [monthDay, bucket] of buckets) {
    byMonthDay[monthDay] = {
      gddCumMean: round1(mean(bucket.gddCum)),
      gddCumP10: round1(percentile(bucket.gddCum, 0.1)),
      gddCumP50: round1(percentile(bucket.gddCum, 0.5)),
      gddCumP90: round1(percentile(bucket.gddCum, 0.9)),
      gddDailyMean: round2(mean(bucket.gddDaily)),
      etoCumMean: round2(mean(bucket.etoCum)),
      etoCumP10: round2(percentile(bucket.etoCum, 0.1)),
      etoCumP50: round2(percentile(bucket.etoCum, 0.5)),
      etoCumP90: round2(percentile(bucket.etoCum, 0.9)),
      precipCumMean: round2(mean(bucket.precipCum)),
      precipCumP10: round2(percentile(bucket.precipCum, 0.1)),
      precipCumP50: round2(percentile(bucket.precipCum, 0.5)),
      precipCumP90: round2(percentile(bucket.precipCum, 0.9)),
    };
  }

  return { byMonthDay, startYear, endYear, yearsWithData: byYear.size };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Linear-interpolated percentile (same method as api/toolboxShared.ts), local so
// calcs/ stays free of api/ imports. Callers guarantee non-empty buckets.
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
