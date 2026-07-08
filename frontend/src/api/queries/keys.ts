// Query-key factories and content signatures. Weather is keyed purely on
// coordinates + date range (matching the providers' own cache keys), so two
// fields at the same location share a fetch. Derived computations are keyed on a
// signature of their config inputs + a signature of the weather they consume, so
// they recompute exactly when (and only when) their inputs change.

import type { CropProfile, FieldConfig, WeatherRecord } from "../../types/domain";

const round6 = (value: number): number => Number(value.toFixed(6));

export const weatherKeys = {
  season: (lat: number, lon: number, startDate: string, endDate: string) =>
    ["weather", "season", { lat: round6(lat), lon: round6(lon), startDate, endDate }] as const,
  chill: (lat: number, lon: number, startDate: string, endDate: string) =>
    ["weather", "chill", { lat: round6(lat), lon: round6(lon), startDate, endDate }] as const,
  year: (lat: number, lon: number, year: number, profile: "full" | "temperature" | "temperature_et") =>
    ["weather", "year", { lat: round6(lat), lon: round6(lon), year, profile }] as const,
};

// A cheap, stable fingerprint of a weather series: it changes when the series
// grows or its tail is corrected/extended (the only ways a refetch alters the
// derived result), and stays identical when a refetch returns the same data — so
// derived computations stay cache-stable instead of recomputing every refetch.
export function weatherSignature(records: WeatherRecord[]): string {
  if (!records.length) return "empty";
  const last = records[records.length - 1];
  return `${records.length}:${records[0].date}:${last.date}:${last.tmaxC}:${last.etoMm}`;
}

// Everything `buildAnalyticsSnapshot` reads from field + crop. Editing stages,
// the biofix date, or the GDD thresholds changes this hash (without touching the
// coordinate-keyed weather), so the cached computation invalidates correctly.
export function snapshotInputsHash(field: FieldConfig, crop: CropProfile): string {
  return JSON.stringify({
    cropId: crop.id,
    start: field.stageStartDate,
    base: field.gddBaseTempC ?? crop.tBaseC,
    upper: field.gddUpperTempC ?? crop.tUpperC,
    stages: field.stageThresholds?.length ? field.stageThresholds : crop.stages,
    kc: crop.kcCurve,
    chill: crop.chillRequirementPortions,
  });
}
