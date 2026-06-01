import { describe, expect, it } from "vitest";
import { buildAnalyticsSnapshot } from "./analytics";
import { dailyGdd } from "./gdd";
import { interpolateKc } from "./kc";
import { dailyMeanVpd } from "./vpd";
import { cropProfiles } from "../data/crops";
import { defaultFields } from "../data/fields";
import type { WeatherRecord } from "../types/domain";

const record: WeatherRecord = {
  date: "2024-03-01",
  tminC: 10,
  tmaxC: 25,
  precipMm: 0,
  etoMm: 5,
  rhMin: 30,
  rhMax: 70,
  source: "historical",
};

describe("Water 3D calculations", () => {
  it("calculates daily GDD with crop base temperature", () => {
    expect(dailyGdd(record, cropProfiles.almond)).toBe(13);
  });

  it("interpolates Kc on configured crop curves", () => {
    expect(interpolateKc(cropProfiles.almond, 0)).toBe(0.4);
    expect(interpolateKc(cropProfiles.almond, 1)).toBe(0.9);
  });

  it("calculates VPD when humidity is available", () => {
    expect(dailyMeanVpd(record)).toBeGreaterThan(0);
  });

  it("builds a crop-aware analytics snapshot", () => {
    const snapshot = buildAnalyticsSnapshot(defaultFields[0], cropProfiles.almond, [record], [0]);
    expect(snapshot.currentGdd).toBe(13);
    expect(snapshot.cumulativeEtcMm).toBeGreaterThan(0);
    expect(snapshot.chillRequirement).toBe(65);
  });
});
