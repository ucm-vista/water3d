import type { WeatherRecord } from "../types/domain";

function saturationVaporPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

export function dailyMeanVpd(record: WeatherRecord): number | undefined {
  const tMean = (record.tminC + record.tmaxC) / 2;
  const es = saturationVaporPressure(tMean);

  if (typeof record.tdewC === "number") {
    return Number((es - saturationVaporPressure(record.tdewC)).toFixed(2));
  }

  if (typeof record.rhMin === "number" && typeof record.rhMax === "number") {
    const rhMean = (record.rhMin + record.rhMax) / 2;
    const ea = es * (rhMean / 100);
    return Number(Math.max(0, es - ea).toFixed(2));
  }

  return undefined;
}
