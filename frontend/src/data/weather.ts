import type { WeatherRecord } from "../types/domain";
import { addUtcDays, toIsoDate } from "../utils/dateRange";

function buildMockWeatherRecords(): WeatherRecord[] {
  const today = new Date();
  const start = addUtcDays(today, -29);

  return Array.from({ length: 30 }, (_, index) => {
    const date = addUtcDays(start, index);
    const seasonalStep = index / 29;

    return {
      date: toIsoDate(date),
      tminC: Number((9 + seasonalStep * 4).toFixed(1)),
      tmaxC: Number((23 + seasonalStep * 8).toFixed(1)),
      precipMm: 0,
      etoMm: Number((4.2 + seasonalStep * 2.4).toFixed(1)),
      rhMin: Math.round(38 - seasonalStep * 14),
      rhMax: Math.round(74 - seasonalStep * 18),
      source: "historical" as const,
    };
  });
}

export const mockWeatherRecords: WeatherRecord[] = buildMockWeatherRecords();

export const mockAppliedWaterMm = Array.from({ length: 30 }, (_, index) => (index % 7 === 0 ? 24 : 0));
