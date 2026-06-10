import { describe, expect, it } from "vitest";
import { cumulativeChillHours } from "./chillHours";
import { activeStageFromGdd, cumulativeGddSeries } from "./gddSeries";
import type { WeatherRecord } from "../types/domain";

const records: WeatherRecord[] = [
  {
    date: "2026-03-01",
    tminC: 10,
    tmaxC: 30,
    precipMm: 0,
    etoMm: 4,
    source: "historical",
    hourlyTempsC: [1, 5, 8, 10],
  },
  {
    date: "2026-03-02",
    tminC: 12,
    tmaxC: 32,
    precipMm: 0,
    etoMm: 5,
    source: "historical",
    hourlyTempsC: [0, 3, 7, 9],
  },
];

describe("crop metric calculations", () => {
  it("builds cumulative GDD series with crop-specific thresholds", () => {
    const series = cumulativeGddSeries(records, 10, 30);
    expect(series).toEqual([
      { date: "2026-03-01", gdd: 10, cumulativeGdd: 10 },
      { date: "2026-03-02", gdd: 11, cumulativeGdd: 21 },
    ]);
  });

  it("selects active and next GDD stages", () => {
    const stages = [
      { label: "Start", gdd: 0 },
      { label: "Bloom", gdd: 20 },
      { label: "Harvest", gdd: 100 },
    ];
    expect(activeStageFromGdd(stages, 21)).toEqual({
      current: { label: "Bloom", gdd: 20 },
      next: { label: "Harvest", gdd: 100 },
    });
  });

  it("counts hourly chill hours inside configured thresholds", () => {
    const series = cumulativeChillHours(records, 0, 7.2);
    expect(series).toEqual([
      { date: "2026-03-01", chillHours: 2, cumulativeChillHours: 2 },
      { date: "2026-03-02", chillHours: 3, cumulativeChillHours: 5 },
    ]);
  });
});
