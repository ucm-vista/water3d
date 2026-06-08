import { describe, expect, it } from "vitest";
import { parseClimateToolboxForecastPet, parseClimateToolboxForecastWeather } from "./climate";

describe("Climate Toolbox API client", () => {
  it("parses dated ensemble PET rows into forecast ET records", () => {
    const records = parseClimateToolboxForecastPet(
      {
        data: [
          { date: "2026-06-07", pet: [4, 6, 5] },
          { date: "2026-06-08", members: [{ value: 7 }, { value: 5 }] },
        ],
      },
      28,
    );

    expect(records).toEqual([
      {
        date: "2026-06-07",
        etoMm: 5,
        etReferenceMm: 5,
        source: "forecast",
      },
      {
        date: "2026-06-08",
        etoMm: 6,
        etReferenceMm: 6,
        source: "forecast",
      },
    ]);
  });

  it("parses date-keyed PET payloads and respects the forecast horizon", () => {
    const records = parseClimateToolboxForecastPet(
      {
        "2026-06-07": [4.1234, 4.5678],
        "2026-06-08": { value: 6.5 },
      },
      1,
    );

    expect(records).toEqual([
      {
        date: "2026-06-07",
        etoMm: 4.346,
        etReferenceMm: 4.346,
        source: "forecast",
      },
    ]);
  });

  it("parses Climate Toolbox cumulative PET ensemble tables using the median daily increment", () => {
    const records = parseClimateToolboxForecastPet(
      [
        {
          "yyyy-mm-dd": ["2026-06-07", "2026-06-08", "2026-06-09"],
          "pet_0(mm)": ["7.2000", "13.6000", "18.5000"],
          "pet_1(mm)": ["6.9000", "13.3000", "18.1000"],
          "pet_50p(mm)": ["7.3000", "13.4500", "18.5000"],
        },
      ],
      28,
    );

    expect(records).toEqual([
      {
        date: "2026-06-07",
        etoMm: 7.3,
        etReferenceMm: 7.3,
        source: "forecast",
      },
      {
        date: "2026-06-08",
        etoMm: 6.15,
        etReferenceMm: 6.15,
        source: "forecast",
      },
      {
        date: "2026-06-09",
        etoMm: 5.05,
        etReferenceMm: 5.05,
        source: "forecast",
      },
    ]);
  });

  it("parses Climate Toolbox forecast weather from temp, precip, humidity, and PET tables", () => {
    const records = parseClimateToolboxForecastWeather({
      pet: [
        {
          "yyyy-mm-dd": ["2026-06-07", "2026-06-08"],
          "pet_10p(mm)": ["7.0000", "12.6400"],
          "pet_50p(mm)": ["7.3000", "13.4500"],
          "pet_90p(mm)": ["7.4000", "14.0300"],
        },
      ],
      tmmx: [
        {
          "yyyy-mm-dd": ["2026-06-07", "2026-06-08"],
          "tmmx_50p(K)": ["302.2000", "301.3000"],
        },
      ],
      tmmn: [
        {
          "yyyy-mm-dd": ["2026-06-07", "2026-06-08"],
          "tmmn_50p(K)": ["287.7000", "286.5500"],
        },
      ],
      pr: [
        {
          "yyyy-mm-dd": ["2026-06-07", "2026-06-08"],
          "pr_50p(mm)": ["0.0000", "0.4500"],
        },
      ],
      sph: [
        {
          "yyyy-mm-dd": ["2026-06-07", "2026-06-08"],
          "sph_50p(kg/kg)": ["0.0077", "0.0077"],
        },
      ],
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      date: "2026-06-07",
      tmaxC: 29.05,
      tminC: 14.55,
      precipMm: 0,
      etoMm: 7.3,
      forecastPetP10Mm: 7,
      forecastPetP90Mm: 7.4,
      source: "forecast",
    });
    expect(records[1]).toMatchObject({
      date: "2026-06-08",
      tmaxC: 28.15,
      tminC: 13.4,
      precipMm: 0.45,
      etoMm: 6.15,
      forecastPetP10Mm: 5.64,
      forecastPetP90Mm: 6.63,
      source: "forecast",
    });
    expect(records[0].rhMin).toBeGreaterThan(0);
    expect(records[0].rhMax).toBe(records[0].rhMin);
    expect(records[0].tdewC).toBeLessThan(records[0].tmaxC);
    expect(records[0].hourlyTempsC).toHaveLength(24);
  });
});
