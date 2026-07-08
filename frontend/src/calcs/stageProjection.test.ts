import { describe, expect, it } from "vitest";
import { getChillSeasonStart } from "./chillHours";
import { averageDailyGddByMonthDay, buildStageProjections, daysAheadOfNormal, findThresholdDate } from "./stageProjection";
import type { DailyAnalytics, WeatherRecord } from "../types/domain";

function analyticsRecord(date: string, gdd: number, cumulativeGdd: number): DailyAnalytics {
  return { date, gdd, cumulativeGdd, kc: 1, etcMm: 0, cumulativeEtcMm: 0, cumulativeEtoMm: 0 };
}

function weatherRecord(date: string, tminC: number, tmaxC: number): WeatherRecord {
  return { date, tminC, tmaxC, precipMm: 0, etoMm: 0, source: "historical" };
}

describe("stage projections", () => {
  const records: DailyAnalytics[] = [
    analyticsRecord("2026-06-01", 10, 10),
    analyticsRecord("2026-06-02", 10, 20),
    analyticsRecord("2026-06-03", 10, 30),
    analyticsRecord("2026-06-04", 10, 40),
  ];
  // 10 GDD per day on every calendar day.
  const normalDaily = new Map(
    Array.from({ length: 366 }, (_, index) => {
      const date = new Date(Date.UTC(2024, 0, 1 + index));
      return [date.toISOString().slice(5, 10), 10] as const;
    }),
  );

  it("marks stages crossed on or before today as reached", () => {
    const [start] = buildStageProjections([{ label: "Start", gdd: 10 }], records, "2026-06-02", normalDaily);
    expect(start).toEqual({ label: "Start", thresholdGdd: 10, status: "reached", date: "2026-06-01" });
  });

  it("marks stages crossed after today but inside the records as forecast", () => {
    const [stage] = buildStageProjections([{ label: "Bloom", gdd: 40 }], records, "2026-06-02", normalDaily);
    expect(stage).toEqual({ label: "Bloom", thresholdGdd: 40, status: "forecast", date: "2026-06-04" });
  });

  it("projects stages past the records using normal daily accumulation", () => {
    const [stage] = buildStageProjections([{ label: "Harvest", gdd: 70 }], records, "2026-06-02", normalDaily);
    expect(stage).toEqual({ label: "Harvest", thresholdGdd: 70, status: "projected", date: "2026-06-07" });
  });

  it("marks unreachable stages as beyond projection", () => {
    const [stage] = buildStageProjections([{ label: "Harvest", gdd: 99_999 }], records, "2026-06-02", new Map([["06-05", 0.1]]));
    expect(stage.status).toBe("beyond-projection");
    expect(stage.date).toBeUndefined();
  });

  it("skips non-numeric stages", () => {
    const projections = buildStageProjections(
      [
        { label: "Dormancy", gdd: null },
        { label: "Bloom", gdd: 10 },
      ],
      records,
      "2026-06-02",
      normalDaily,
    );
    expect(projections).toHaveLength(1);
    expect(projections[0].label).toBe("Bloom");
  });
});

describe("averageDailyGddByMonthDay", () => {
  it("averages daily GDD across years by calendar day", () => {
    const byYear = {
      2024: [weatherRecord("2024-03-01", 10, 20)],
      2025: [weatherRecord("2025-03-01", 10, 30)],
    };
    const averages = averageDailyGddByMonthDay(byYear, { tBaseC: 10, tUpperC: 35 });
    // 2024: (20+10)/2-10 = 5; 2025: (30+10)/2-10 = 10; mean = 7.5
    expect(averages.get("03-01")).toBe(7.5);
  });
});

describe("findThresholdDate", () => {
  it("returns the first date the cumulative GDD crosses the threshold", () => {
    const records = [analyticsRecord("2025-04-01", 10, 10), analyticsRecord("2025-04-02", 10, 20)];
    expect(findThresholdDate(records, 15)).toBe("2025-04-02");
    expect(findThresholdDate(records, 25)).toBeUndefined();
  });
});

describe("daysAheadOfNormal", () => {
  const normal = [10, 20, 30, 40, 50];

  it("reports days ahead when normal only reaches today's value later in the season", () => {
    // Current GDD 30 on day index 1; normal does not hit 30 until index 2 -> 1 day ahead.
    expect(daysAheadOfNormal(30, normal, 1)).toBe(1);
  });

  it("reports days behind when normal reached today's value earlier in the season", () => {
    expect(daysAheadOfNormal(30, normal, 3)).toBe(-1);
  });

  it("returns zero when tracking normal exactly", () => {
    expect(daysAheadOfNormal(30, normal, 2)).toBe(0);
  });

  it("returns undefined when current exceeds the whole normal series", () => {
    expect(daysAheadOfNormal(99, normal, 6)).toBeUndefined();
  });

  it("returns undefined with no normal data", () => {
    expect(daysAheadOfNormal(30, [], 2)).toBeUndefined();
  });
});

describe("getChillSeasonStart", () => {
  it("uses the previous calendar year before the rule month-day", () => {
    expect(getChillSeasonStart("previous-july-15", "2026-06-10")).toBe("2025-07-15");
    expect(getChillSeasonStart("previous-nov-01", "2026-06-10")).toBe("2025-11-01");
  });

  it("uses the current calendar year on or after the rule month-day", () => {
    expect(getChillSeasonStart("previous-july-15", "2026-08-01")).toBe("2026-07-15");
    expect(getChillSeasonStart("previous-nov-01", "2026-12-15")).toBe("2026-11-01");
  });

  it("returns undefined for crops without chill tracking", () => {
    expect(getChillSeasonStart("none", "2026-06-10")).toBeUndefined();
  });
});
