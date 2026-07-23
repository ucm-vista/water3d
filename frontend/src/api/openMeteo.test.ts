import { describe, expect, it } from "vitest";
import { parseOpenMeteoHistoricalWeather } from "./openMeteo";

describe("Open-Meteo API client", () => {
  it("parses daily and hourly historical weather into weather records", () => {
    const records = parseOpenMeteoHistoricalWeather({
      daily: {
        time: ["2026-06-01", "2026-06-02"],
        temperature_2m_min: [12.123, 13],
        temperature_2m_max: [29.456, 31],
        precipitation_sum: [0, 1.25],
        et0_fao_evapotranspiration: [6.2, 6.8],
      },
      hourly: {
        time: ["2026-06-01T00:00", "2026-06-01T01:00", "2026-06-02T00:00"],
        temperature_2m: [14, 15.25, 16],
        relative_humidity_2m: [80, 70, 65],
        dew_point_2m: [10, 11, 12],
      },
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      date: "2026-06-01",
      tminC: 12.12,
      tmaxC: 29.46,
      precipMm: 0,
      etoMm: 6.2,
      source: "historical",
      rhMin: 70,
      rhMax: 80,
      tdewC: 10.5,
      hourlyTempsC: [14, 15.25],
    });
    expect(records[1]).toMatchObject({
      date: "2026-06-02",
      precipMm: 1.25,
      etoMm: 6.8,
      rhMin: 65,
      rhMax: 65,
      tdewC: 12,
    });
  });

  it("tags seam-backfill records as forecast so gridMET replaces them once available", () => {
    const records = parseOpenMeteoHistoricalWeather(
      {
        daily: {
          time: ["2026-07-22"],
          temperature_2m_min: [21.9],
          temperature_2m_max: [34.3],
          precipitation_sum: [0],
          et0_fao_evapotranspiration: [7.1],
        },
      },
      { source: "forecast" },
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ date: "2026-07-22", source: "forecast", etoMm: 7.1 });
  });

  it("skips days missing required temperatures", () => {
    const records = parseOpenMeteoHistoricalWeather({
      daily: {
        time: ["2026-06-01", "2026-06-02"],
        temperature_2m_min: [null, 13],
        temperature_2m_max: [29, 31],
      },
    });

    expect(records.map((record) => record.date)).toEqual(["2026-06-02"]);
  });
});
