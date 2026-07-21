import { describe, expect, it } from "vitest";
import { buildChillClimatology, type ChillBandDay, type ChillObservedRow } from "./chillClimatology";

const SEASON_START = "2025-10-01";
const BASELINE = "1979–2022";

const observed: ChillObservedRow[] = [
  { date: "2025-10-01", dailyPortions: 0 },
  { date: "2025-10-02", dailyPortions: 0.5 },
  { date: "2025-10-03", dailyPortions: 1.0 },
];

// Cumulative, index-from-Oct-1; extends two days past the observed tail, with a
// `nan` tail row (null) like the real files.
const band: ChillBandDay[] = [
  { p10: 0, p50: 0, p90: 0 },
  { p10: 0, p50: 0.2, p90: 0.4 },
  { p10: 0.1, p50: 0.5, p90: 0.9 },
  { p10: 0.3, p50: 0.8, p90: 1.2 },
  { p10: null, p50: null, p90: null },
];

describe("buildChillClimatology", () => {
  const result = buildChillClimatology({ observed, band, seasonStart: SEASON_START, baselineLabel: BASELINE });

  it("accumulates the observed daily portions into a cumulative series", () => {
    expect(result.days.slice(0, 3).map((day) => day.cumulativePortions)).toEqual([0, 0.5, 1.5]);
    expect(result.currentCumulative).toBe(1.5);
    expect(result.observedThrough).toBe("2025-10-03");
    expect(result.hasObserved).toBe(true);
  });

  it("aligns the band to the observed series by index from the season start", () => {
    expect(result.days[0]).toMatchObject({ date: "2025-10-01", bandP50: 0 });
    expect(result.days[2]).toMatchObject({ date: "2025-10-03", bandP10: 0.1, bandP50: 0.5, bandP90: 0.9 });
    expect(result.hasBand).toBe(true);
  });

  it("extends the day axis to the band length so the normal draws past the observed tail", () => {
    expect(result.days).toHaveLength(5);
    // Day 4 (2025-10-04) has band context but no observed value yet.
    expect(result.days[3]).toMatchObject({ date: "2025-10-04", cumulativePortions: null, bandP50: 0.8 });
    // The `nan` tail row stays null rather than 0.
    expect(result.days[4]).toMatchObject({ date: "2025-10-05", bandP50: null });
  });

  it("reports no observed data when the observed file is missing (fallback signal)", () => {
    const bandOnly = buildChillClimatology({ observed: [], band, seasonStart: SEASON_START, baselineLabel: BASELINE });
    expect(bandOnly.hasObserved).toBe(false);
    expect(bandOnly.currentCumulative).toBeNull();
    expect(bandOnly.hasBand).toBe(true);
    expect(bandOnly.days).toHaveLength(5);
  });
});
