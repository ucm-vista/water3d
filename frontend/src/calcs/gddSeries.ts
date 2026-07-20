import type { StageThreshold, WeatherRecord } from "../types/domain";
import { addUtcDays, toIsoDate } from "../utils/dateRange";

export interface GddSeriesPoint {
  date: string;
  gdd: number;
  cumulativeGdd: number;
}

export function dailyGddWithThresholds(record: WeatherRecord, baseTempC: number, upperTempC: number): number {
  const cappedMax = Math.min(record.tmaxC, upperTempC);
  const cappedMin = Math.max(record.tminC, baseTempC);
  return Math.max(0, (cappedMax + cappedMin) / 2 - baseTempC);
}

export function cumulativeGddSeries(records: WeatherRecord[], baseTempC: number, upperTempC: number): GddSeriesPoint[] {
  let total = 0;

  return records.map((record) => {
    const gdd = dailyGddWithThresholds(record, baseTempC, upperTempC);
    total += gdd;
    return {
      date: record.date,
      gdd: Number(gdd.toFixed(1)),
      cumulativeGdd: Number(total.toFixed(1)),
    };
  });
}

export interface SeasonSeriesSplitInput {
  /** Season records (sorted by date ascending) carrying cumulative GDD. */
  records: ReadonlyArray<{ date: string; cumulativeGdd: number }>;
  /** True when the weather backing this date is forecast, not observed. */
  isForecastDate: (date: string) => boolean;
  /** Last date the chart renders data for (min of loaded data / horizon). */
  actualEndDate: string;
  /** End of the selected forecast window. */
  forecastHorizonDate: string;
  /** Extend the dashed line past loaded data at the climatological daily rate. */
  includeProjection: boolean;
  /** Average daily GDD keyed by "MM-DD", used for the projection extension. */
  normalDailyGddByMonthDay: ReadonlyMap<string, number>;
}

export interface SeasonSeriesSplit {
  /** Solid line: observed (historical-source) days only. */
  currentByDate: Map<string, number>;
  /** Dashed line: seam point + forecast days + normal-rate extension. */
  projectedByDate: Map<string, number>;
}

// The last observed day is written into BOTH maps (the seam) so the solid and
// dashed Recharts lines share a point and render as one continuous curve.
export function splitSeasonSeries(input: SeasonSeriesSplitInput): SeasonSeriesSplit {
  const currentByDate = new Map<string, number>();
  const projectedByDate = new Map<string, number>();

  const inWindow = input.records.filter((record) => record.date <= input.actualEndDate);
  let lastObserved: { date: string; cumulativeGdd: number } | undefined;
  for (const record of inWindow) {
    if (input.isForecastDate(record.date)) continue;
    currentByDate.set(record.date, record.cumulativeGdd);
    lastObserved = record;
  }

  let lastDashed = lastObserved;
  if (lastObserved) projectedByDate.set(lastObserved.date, lastObserved.cumulativeGdd);
  for (const record of inWindow) {
    if (!input.isForecastDate(record.date)) continue;
    if (lastObserved && record.date <= lastObserved.date) continue;
    projectedByDate.set(record.date, record.cumulativeGdd);
    if (!lastDashed || record.date > lastDashed.date) lastDashed = record;
  }

  if (input.includeProjection && lastDashed && input.normalDailyGddByMonthDay.size && lastDashed.date < input.forecastHorizonDate) {
    let cumulative = lastDashed.cumulativeGdd;
    let cursor = new Date(`${lastDashed.date}T00:00:00Z`);
    const end = new Date(`${input.forecastHorizonDate}T00:00:00Z`);
    while (cursor < end) {
      cursor = addUtcDays(cursor, 1);
      const iso = toIsoDate(cursor);
      cumulative += input.normalDailyGddByMonthDay.get(iso.slice(5)) ?? 0;
      projectedByDate.set(iso, cumulative);
    }
  }

  return { currentByDate, projectedByDate };
}

export function activeStageFromGdd(stages: StageThreshold[], cumulativeGdd: number): { current: StageThreshold; next?: StageThreshold } {
  const numericStages = stages.filter((stage) => typeof stage.gdd === "number");
  const current = numericStages.reduce((active, stage) => (typeof stage.gdd === "number" && cumulativeGdd >= stage.gdd ? stage : active), numericStages[0] ?? stages[0]);
  const next = numericStages.find((stage) => typeof stage.gdd === "number" && stage.gdd > cumulativeGdd);
  return { current, next };
}
