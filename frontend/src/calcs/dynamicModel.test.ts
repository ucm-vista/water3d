import { describe, expect, it } from "vitest";
import type { WeatherRecord } from "../types/domain";
import { cumulativeChillPortions, initialDynamicState, stepDynamicModel } from "./dynamicModel";

function runHours(temps: number[]): number {
  let state = initialDynamicState();
  for (const temp of temps) state = stepDynamicModel(state, temp);
  return state.portions;
}

function dayFromHourly(date: string, temps: number[]): WeatherRecord {
  return {
    date,
    tminC: Math.min(...temps),
    tmaxC: Math.max(...temps),
    precipMm: 0,
    etoMm: 0,
    source: "historical",
    hourlyTempsC: temps,
  };
}

describe("stepDynamicModel", () => {
  it("banks portions at a steady rate near the optimal chilling temperature", () => {
    // Golden values from the canonical chillR/ChillModels recurrence.
    expect(runHours(Array(48).fill(6))).toBeCloseTo(0.9805, 3);
    expect(runHours(Array(720).fill(6))).toBeCloseTo(24.43, 1);
  });

  it("accumulates no chill under sustained warmth", () => {
    expect(runHours(Array(720).fill(25))).toBe(0);
  });

  it("is monotonically non-decreasing hour over hour", () => {
    let state = initialDynamicState();
    let previous = 0;
    for (const temp of [4, 8, 2, 15, 6, 30, 5, 5, 5]) {
      state = stepDynamicModel(state, temp);
      expect(state.portions).toBeGreaterThanOrEqual(previous);
      previous = state.portions;
    }
  });

  it("lets warmth stall accumulation without ever removing banked portions", () => {
    const cold = runHours(Array(200).fill(5));
    const coldThenWarm = runHours([...Array(200).fill(5), ...Array(200).fill(28)]);
    // Portions are permanent: heat can halt the intermediate but cannot un-bank.
    expect(coldThenWarm).toBeGreaterThanOrEqual(cold);
  });
});

describe("cumulativeChillPortions", () => {
  it("carries model state continuously across day boundaries", () => {
    const coldDay = Array(24).fill(5);
    const records = ["2025-12-01", "2025-12-02", "2025-12-03"].map((date) => dayFromHourly(date, coldDay));
    const series = cumulativeChillPortions(records);

    expect(series).toHaveLength(3);
    // Three continuous cold days must equal one 72-hour cold run — proving the
    // model does not reset at midnight.
    expect(series[2].cumulativePortions).toBeCloseTo(Number(runHours(Array(72).fill(5)).toFixed(2)), 2);
    // No portion banks until the intermediate product crosses its threshold, so
    // day 1 stays at 0 and later days accumulate.
    expect(series[0].dailyPortions).toBe(0);
    expect(series[2].dailyPortions).toBeGreaterThan(0);
    expect(series[2].cumulativePortions).toBeGreaterThan(series[1].cumulativePortions);
  });

  it("falls back to a sine reconstruction when hourly data is absent", () => {
    const record = (date: string): WeatherRecord => ({ date, tminC: 2, tmaxC: 9, precipMm: 0, etoMm: 0, source: "historical" });
    const series = cumulativeChillPortions(["2025-12-01", "2025-12-02", "2025-12-03", "2025-12-04", "2025-12-05"].map(record));
    // A cold spell reconstructed from daily min/max still accumulates chill.
    expect(series.at(-1)!.cumulativePortions).toBeGreaterThan(0);
  });
});
