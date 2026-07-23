import { describe, expect, it } from "vitest";
import type { WeatherRecord } from "../../types/domain";
import { applyWeatherSupplements, mergeWeatherRecords, seamBackfillRange } from "./weather";

function record(date: string, source: WeatherRecord["source"], tmaxC: number): WeatherRecord {
  return { date, source, tminC: 10, tmaxC, etoMm: 0, precipMm: 0 };
}

describe("staged season weather", () => {
  it("keeps historical records when the forecast overlaps their dates", () => {
    const merged = mergeWeatherRecords([
      record("2026-06-01", "historical", 25),
      record("2026-06-01", "forecast", 31),
    ]);

    expect(merged).toEqual([record("2026-06-01", "historical", 25)]);
  });

  it("adds background metrics without changing GDD temperatures", () => {
    const base = [record("2026-06-01", "historical", 25)];
    const enriched = applyWeatherSupplements(base, [
      { date: "2026-06-01", etoMm: 5.4, precipMm: 1.2, vpdKpa: 1.1 },
    ]);

    expect(enriched[0]).toMatchObject({ tminC: 10, tmaxC: 25, etoMm: 5.4, precipMm: 1.2, vpdKpa: 1.1 });
  });
});

describe("seamBackfillRange", () => {
  const todayIso = "2026-07-23";

  it("covers the days between the gridMET tail and the first CFS day", () => {
    expect(seamBackfillRange({ lastHistoricalDate: "2026-07-21", firstForecastDate: "2026-07-24", todayIso })).toEqual({
      startDate: "2026-07-22",
      endDate: "2026-07-23",
    });
  });

  it("returns null when history meets the forecast", () => {
    expect(seamBackfillRange({ lastHistoricalDate: "2026-07-22", firstForecastDate: "2026-07-23", todayIso })).toBeNull();
  });

  it("stops the day before a forecast that already covers today", () => {
    expect(seamBackfillRange({ lastHistoricalDate: "2026-07-20", firstForecastDate: "2026-07-23", todayIso })).toEqual({
      startDate: "2026-07-21",
      endDate: "2026-07-22",
    });
  });

  it("runs through today when the forecast is unavailable", () => {
    expect(seamBackfillRange({ lastHistoricalDate: "2026-07-21", firstForecastDate: undefined, todayIso })).toEqual({
      startDate: "2026-07-22",
      endDate: "2026-07-23",
    });
  });

  it("returns null without any history (an outage, not a seam)", () => {
    expect(seamBackfillRange({ lastHistoricalDate: undefined, firstForecastDate: "2026-07-24", todayIso })).toBeNull();
  });

  it("caps the window so a long gridMET outage cannot demand a season-length pull", () => {
    expect(seamBackfillRange({ lastHistoricalDate: "2026-05-01", firstForecastDate: "2026-07-24", todayIso })).toEqual({
      startDate: "2026-07-10",
      endDate: "2026-07-23",
    });
  });
});
