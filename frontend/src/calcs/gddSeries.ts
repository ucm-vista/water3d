import type { StageThreshold, WeatherRecord } from "../types/domain";

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

export function activeStageFromGdd(stages: StageThreshold[], cumulativeGdd: number): { current: StageThreshold; next?: StageThreshold } {
  const numericStages = stages.filter((stage) => typeof stage.gdd === "number");
  const current = numericStages.reduce((active, stage) => (typeof stage.gdd === "number" && cumulativeGdd >= stage.gdd ? stage : active), numericStages[0] ?? stages[0]);
  const next = numericStages.find((stage) => typeof stage.gdd === "number" && stage.gdd > cumulativeGdd);
  return { current, next };
}
