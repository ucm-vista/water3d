import type { CropProfile, WeatherRecord } from "../types/domain";

export function dailyGdd(record: WeatherRecord, crop: Pick<CropProfile, "tBaseC" | "tUpperC">): number {
  const cappedMax = Math.min(record.tmaxC, crop.tUpperC);
  const cappedMin = Math.max(record.tminC, crop.tBaseC);
  return Math.max(0, (cappedMax + cappedMin) / 2 - crop.tBaseC);
}

export function cumulativeGdd(records: WeatherRecord[], crop: CropProfile): number[] {
  let total = 0;
  return records.map((record) => {
    total += dailyGdd(record, crop);
    return Number(total.toFixed(1));
  });
}
