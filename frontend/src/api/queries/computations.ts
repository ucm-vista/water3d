// Derived computations modeled as network-free queries. Their queryFns run pure
// calc functions over already-fetched weather, but because they're real queries
// their results are persisted to localStorage alongside the raw data — so a
// reload restores the computed series instead of recomputing it.
//
// Each hook keys on a signature of its config inputs + a signature of the data it
// consumes, and returns the value directly with a synchronous fallback so the
// first render (before the async query resolves) never blocks. `staleTime:
// Infinity` because a computation is a pure function of its key: it can only go
// "stale" by its inputs changing, which already produces a new key.

import { useQuery } from "@tanstack/react-query";
import { buildAnalyticsSnapshot } from "../../calcs/analytics";
import { cumulativeChillPortions } from "../../calcs/dynamicModel";
import { buildStageProjections } from "../../calcs/stageProjection";
import type { AnalyticsSnapshot, CropProfile, DailyAnalytics, FieldConfig, StageThreshold, WeatherRecord } from "../../types/domain";
import { snapshotInputsHash, weatherSignature } from "./keys";

function analyticsRecordsSignature(records: DailyAnalytics[]): string {
  if (!records.length) return "empty";
  const last = records[records.length - 1];
  return `${records.length}:${records[0].date}:${last.date}:${last.cumulativeGdd}`;
}

function normalGddSignature(map: Map<string, number>): string {
  if (!map.size) return "empty";
  let sum = 0;
  for (const value of map.values()) sum += value;
  return `${map.size}:${sum.toFixed(1)}`;
}

// Cumulative GDD / ETc / stage snapshot for one field-season.
export function useAnalyticsSnapshot(field: FieldConfig, crop: CropProfile, weather: WeatherRecord[]): AnalyticsSnapshot {
  const query = useQuery({
    queryKey: ["calc", "snapshot", snapshotInputsHash(field, crop), weatherSignature(weather)],
    staleTime: Infinity,
    queryFn: async () => buildAnalyticsSnapshot(field, crop, weather, []),
  });
  return query.data ?? buildAnalyticsSnapshot(field, crop, weather, []);
}

// Cumulative Chill Portions (Dynamic Model) series for the dormant season.
export function useChillSeries(records: WeatherRecord[]) {
  const compute = () => cumulativeChillPortions(records);
  const query = useQuery({
    queryKey: ["calc", "chill-portions", weatherSignature(records)],
    staleTime: Infinity,
    queryFn: async () => compute(),
  });
  return query.data ?? compute();
}

// Per-stage reached/forecast/projected dates for the growth-stage timeline.
export function useStageProjections(
  stages: StageThreshold[],
  records: DailyAnalytics[],
  todayIso: string,
  normalDailyGddByMonthDay: Map<string, number>,
) {
  const compute = () => buildStageProjections(stages, records, todayIso, normalDailyGddByMonthDay);
  const query = useQuery({
    queryKey: [
      "calc",
      "stages",
      JSON.stringify(stages),
      analyticsRecordsSignature(records),
      todayIso,
      normalGddSignature(normalDailyGddByMonthDay),
    ],
    staleTime: Infinity,
    queryFn: async () => compute(),
  });
  return query.data ?? compute();
}
