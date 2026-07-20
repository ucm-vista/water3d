import { describe, expect, it } from "vitest";
import { buildClimatologyStats } from "./climatology";
import type { WeatherRecord } from "../types/domain";

function record(date: string, tminC: number, tmaxC: number, etoMm = 0, precipMm = 0): WeatherRecord {
  return { date, tminC, tmaxC, etoMm, precipMm, source: "historical" };
}

// dailyGdd with base 10 / upper 30: ((min(tmax,30) + max(tmin,10)) / 2) - 10.
const OPTIONS = { startYear: 2021, endYear: 2023, gddBaseTempC: 10, gddUpperTempC: 30, alignStartMonthDay: "06-01" };

describe("buildClimatologyStats", () => {
  // tmin 10 / tmax 20-30-40 → daily GDD 5, 10, 10 (2023's tmax 40 caps at 30).
  const records = [2021, 2022, 2023].flatMap((year, index) => {
    const tmax = 20 + index * 10;
    return ["06-01", "06-02", "06-03"].map((monthDay) => record(`${year}-${monthDay}`, 10, tmax, 2 + index, index));
  });
  // Distinct uncapped years: daily GDD 5, 8, 10.
  const distinct = [
    ...["06-01", "06-02", "06-03"].map((d) => record(`2021-${d}`, 10, 20, 2, 0)), // gdd 5/day
    ...["06-01", "06-02", "06-03"].map((d) => record(`2022-${d}`, 10, 26, 3, 1)), // gdd 8/day
    ...["06-01", "06-02", "06-03"].map((d) => record(`2023-${d}`, 10, 30, 4, 2)), // gdd 10/day
  ];

  it("computes per-day cumulative mean and interpolated percentiles across years", () => {
    const stats = buildClimatologyStats(distinct, OPTIONS);
    const day3 = stats.byMonthDay["06-03"];
    // Cumulative GDD by 06-03: 15, 24, 30 → mean 23, P50 24.
    expect(day3.gddCumMean).toBe(23);
    expect(day3.gddCumP50).toBe(24);
    // P10 with n=3: rank = 0.2 → 15 + 0.2*(24-15) = 16.8; P90: 24 + 0.8*(30-24) = 28.8.
    expect(day3.gddCumP10).toBe(16.8);
    expect(day3.gddCumP90).toBe(28.8);
    // Daily mean GDD on any day: (5+8+10)/3 = 7.67.
    expect(day3.gddDailyMean).toBe(7.67);
    // Cumulative ETo by 06-03: 6, 9, 12 → mean 9. Precip: 0, 3, 6 → mean 3.
    expect(day3.etoCumMean).toBe(9);
    expect(day3.precipCumMean).toBe(3);
    // Cumulative precip by 06-03: 0, 3, 6 → P10 rank 0.2 = 0.6; P50 = 3; P90 rank 1.8 = 5.4.
    expect(day3.precipCumP10).toBe(0.6);
    expect(day3.precipCumP50).toBe(3);
    expect(day3.precipCumP90).toBe(5.4);
    expect(stats.yearsWithData).toBe(3);
  });

  it("restarts cumulative accumulation at the alignment month-day", () => {
    const withPreSeason = [record("2021-05-31", 10, 40), ...distinct];
    const stats = buildClimatologyStats(withPreSeason, OPTIONS);
    // The huge 05-31 day is before the biofix and must not leak into 06-01.
    expect(stats.byMonthDay["06-01"].gddCumP90).toBeLessThanOrEqual(10);
    expect(stats.byMonthDay["05-31"]).toBeUndefined();
  });

  it("caps daily GDD at the upper temperature threshold", () => {
    const stats = buildClimatologyStats(records, OPTIONS);
    // 2023 rows (tmax 40) accumulate like tmax 30: 10/day → 30 by 06-03, same as 2022.
    expect(stats.byMonthDay["06-03"].gddCumP90).toBe(30);
  });

  it("ignores records outside the year window", () => {
    const stats = buildClimatologyStats([record("2019-06-01", 10, 40), ...distinct], OPTIONS);
    expect(stats.yearsWithData).toBe(3);
    expect(stats.byMonthDay["06-01"].gddCumP90).toBeLessThanOrEqual(10);
  });

  it("handles days present in only some years (Feb-29 style gaps)", () => {
    const gappy = [...distinct, record("2021-06-04", 10, 20, 2, 0)];
    const stats = buildClimatologyStats(gappy, OPTIONS);
    const day4 = stats.byMonthDay["06-04"];
    // Only 2021 reaches 06-04: cumulative 20; single-sample percentiles collapse to it.
    expect(day4.gddCumMean).toBe(20);
    expect(day4.gddCumP10).toBe(20);
    expect(day4.gddCumP90).toBe(20);
  });

  it("returns empty stats for empty input", () => {
    const stats = buildClimatologyStats([], OPTIONS);
    expect(Object.keys(stats.byMonthDay)).toHaveLength(0);
    expect(stats.yearsWithData).toBe(0);
  });
});
