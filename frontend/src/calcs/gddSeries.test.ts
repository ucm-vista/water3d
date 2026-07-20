import { describe, expect, it } from "vitest";
import { splitSeasonSeries, type SeasonSeriesSplitInput } from "./gddSeries";

function record(date: string, cumulativeGdd: number) {
  return { date, cumulativeGdd };
}

const FLAT_NORMAL = new Map(
  Array.from({ length: 366 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index));
    return [date.toISOString().slice(5, 10), 10] as const;
  }),
);

function split(overrides: Partial<SeasonSeriesSplitInput>) {
  return splitSeasonSeries({
    records: [],
    isForecastDate: () => false,
    actualEndDate: "2026-06-30",
    forecastHorizonDate: "2026-06-30",
    includeProjection: true,
    normalDailyGddByMonthDay: FLAT_NORMAL,
    ...overrides,
  });
}

describe("splitSeasonSeries", () => {
  // gridMET lags ~2 days: observed ends 06-08, forecast records cover 06-09+.
  const records = [
    record("2026-06-05", 10),
    record("2026-06-06", 20),
    record("2026-06-07", 30),
    record("2026-06-08", 40),
    record("2026-06-09", 50),
    record("2026-06-10", 60),
    record("2026-06-11", 70),
  ];
  const forecastFrom = (start: string) => (date: string) => date >= start;

  it("renders observed days solid and forecast days dashed, sharing the seam point", () => {
    const { currentByDate, projectedByDate } = split({
      records,
      isForecastDate: forecastFrom("2026-06-09"),
      actualEndDate: "2026-06-11",
      forecastHorizonDate: "2026-06-11",
    });
    expect([...currentByDate.keys()]).toEqual(["2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08"]);
    expect([...projectedByDate.keys()]).toEqual(["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11"]);
    // Seam: same date, identical value in both maps so the lines connect.
    expect(currentByDate.get("2026-06-08")).toBe(40);
    expect(projectedByDate.get("2026-06-08")).toBe(40);
  });

  it("extends past a short forecast at the normal daily rate", () => {
    const { projectedByDate } = split({
      records,
      isForecastDate: forecastFrom("2026-06-09"),
      actualEndDate: "2026-06-11",
      forecastHorizonDate: "2026-06-13",
    });
    expect(projectedByDate.get("2026-06-12")).toBe(80);
    expect(projectedByDate.get("2026-06-13")).toBe(90);
  });

  it("skips the extension when projection is disabled but keeps the forecast segment", () => {
    const { projectedByDate } = split({
      records,
      isForecastDate: forecastFrom("2026-06-09"),
      actualEndDate: "2026-06-11",
      forecastHorizonDate: "2026-06-13",
      includeProjection: false,
    });
    expect([...projectedByDate.keys()]).toEqual(["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11"]);
  });

  it("bridges the observation lag gap with the projection when no forecast is loaded", () => {
    const observedOnly = records.slice(0, 4); // ends 06-08, two days before "today"
    const { currentByDate, projectedByDate } = split({
      records: observedOnly,
      actualEndDate: "2026-06-10",
      forecastHorizonDate: "2026-06-10",
    });
    expect([...currentByDate.keys()]).toEqual(["2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08"]);
    expect(projectedByDate.get("2026-06-09")).toBe(50);
    expect(projectedByDate.get("2026-06-10")).toBe(60);
  });

  it("ignores records beyond the actual end date", () => {
    const { currentByDate, projectedByDate } = split({
      records,
      isForecastDate: forecastFrom("2026-06-09"),
      actualEndDate: "2026-06-09",
      forecastHorizonDate: "2026-06-09",
    });
    expect(currentByDate.has("2026-06-10")).toBe(false);
    expect([...projectedByDate.keys()]).toEqual(["2026-06-08", "2026-06-09"]);
  });

  it("returns forecast-only dashed data when nothing is observed yet", () => {
    const { currentByDate, projectedByDate } = split({
      records: records.slice(4),
      isForecastDate: () => true,
      actualEndDate: "2026-06-11",
      forecastHorizonDate: "2026-06-11",
    });
    expect(currentByDate.size).toBe(0);
    expect([...projectedByDate.keys()]).toEqual(["2026-06-09", "2026-06-10", "2026-06-11"]);
  });

  it("returns empty maps for empty input", () => {
    const { currentByDate, projectedByDate } = split({ records: [], includeProjection: false });
    expect(currentByDate.size).toBe(0);
    expect(projectedByDate.size).toBe(0);
  });
});
