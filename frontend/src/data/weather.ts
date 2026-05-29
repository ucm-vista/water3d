import type { WeatherRecord } from "../types/domain";

const historical: WeatherRecord[] = [
  ["2026-03-01", 7, 19, 0, 3.2, 42, 78],
  ["2026-03-04", 8, 21, 0, 3.6, 39, 74],
  ["2026-03-07", 9, 22, 0, 3.9, 36, 72],
  ["2026-03-10", 10, 24, 0, 4.4, 34, 68],
  ["2026-03-13", 11, 25, 0, 4.8, 31, 64],
  ["2026-03-16", 12, 27, 0, 5.3, 28, 60],
  ["2026-03-19", 14, 29, 0, 5.9, 24, 55],
  ["2026-03-22", 13, 28, 0, 5.6, 26, 58],
  ["2026-03-25", 12, 26, 0, 5.1, 32, 62],
].map(([date, tminC, tmaxC, precipMm, etoMm, rhMin, rhMax]) => ({
  date: String(date),
  tminC: Number(tminC),
  tmaxC: Number(tmaxC),
  precipMm: Number(precipMm),
  etoMm: Number(etoMm),
  rhMin: Number(rhMin),
  rhMax: Number(rhMax),
  source: "historical" as const,
}));

const forecast: WeatherRecord[] = [
  ["2026-03-28", 13, 29, 0, 5.8, 25, 58],
  ["2026-03-31", 14, 31, 0, 6.4, 21, 50],
  ["2026-04-03", 16, 34, 0, 7.1, 18, 46],
].map(([date, tminC, tmaxC, precipMm, etoMm, rhMin, rhMax]) => ({
  date: String(date),
  tminC: Number(tminC),
  tmaxC: Number(tmaxC),
  precipMm: Number(precipMm),
  etoMm: Number(etoMm),
  rhMin: Number(rhMin),
  rhMax: Number(rhMax),
  source: "forecast" as const,
}));

export const mockWeatherRecords: WeatherRecord[] = [...historical, ...forecast] as WeatherRecord[];

export const mockAppliedWaterMm = [18, 23, 20, 30, 34, 31, 42, 38, 35, 36, 39, 41];
