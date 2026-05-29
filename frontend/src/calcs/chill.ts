import type { WeatherRecord } from "../types/domain";

export function estimateChillPortions(records: WeatherRecord[]): number {
  const portions = records.reduce((total, record) => {
    const mean = (record.tminC + record.tmaxC) / 2;
    if (mean >= 2 && mean <= 12) return total + 1.8;
    if (mean > 12 && mean <= 18) return total + 0.7;
    if (mean > 18) return total - 0.2;
    return total;
  }, 72);

  return Number(Math.max(0, portions).toFixed(1));
}
