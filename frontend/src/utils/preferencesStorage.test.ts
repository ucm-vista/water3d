import { beforeEach, describe, expect, it } from "vitest";
import { buildDefaultGraphSettings, type GraphSettings } from "../components/graphSettings";
import { buildFieldPrefs, localPreferencesRepository, mergeGraphSettings } from "./preferencesStorage";

function defaults(): GraphSettings {
  return buildDefaultGraphSettings({
    startDate: "2026-03-01",
    endDate: "2026-07-17",
    forecastDays: 28,
    comparisonYears: [2023, 2024, 2025],
    selectedComparisonYears: [2025],
    gddBaseTempC: 10,
    gddUpperTempC: 30,
    chillThresholdMinC: 0,
    chillThresholdMaxC: 7.2,
  });
}

const CONTEXT = { cropId: "tomato", currentYear: 2026 };

describe("mergeGraphSettings", () => {
  it("returns defaults untouched when there are no saved prefs", () => {
    expect(mergeGraphSettings(defaults(), undefined, CONTEXT)).toEqual(defaults());
  });

  it("discards prefs saved under a different crop", () => {
    const prefs = buildFieldPrefs({ ...defaults(), forecastDays: 7 }, { gddChartMode: "daily", etChartMode: "precip", chillModel: "portions" }, "almond");
    expect(mergeGraphSettings(defaults(), prefs, CONTEXT)).toEqual(defaults());
  });

  it("restores saved presentation prefs over defaults key-by-key", () => {
    const saved: GraphSettings = { ...defaults(), forecastDays: 7, chillThresholdMinC: 1.5, yAxisMax: 2000, show: { ...defaults().show, projection: false } };
    const prefs = buildFieldPrefs(saved, { gddChartMode: "daily", etChartMode: "referenceEt", chillModel: "portions" }, "tomato");
    const merged = mergeGraphSettings(defaults(), prefs, CONTEXT);
    expect(merged.forecastDays).toBe(7);
    expect(merged.chillThresholdMinC).toBe(1.5);
    expect(merged.yAxisMax).toBe(2000);
    expect(merged.show.projection).toBe(false);
    // Untouched flags keep their defaults.
    expect(merged.show.currentSeason).toBe(true);
  });

  it("drops comparison years at or beyond the current year", () => {
    const saved: GraphSettings = { ...defaults(), selectedComparisonYears: [2024, 2026], comparisonYears: [2024, 2026, 2027] };
    const prefs = buildFieldPrefs(saved, { gddChartMode: "cumulative", etChartMode: "cropEt", chillModel: "portions" }, "tomato");
    const merged = mergeGraphSettings(defaults(), prefs, CONTEXT);
    expect(merged.selectedComparisonYears).toEqual([2024]);
    expect(merged.comparisonYears).toEqual([2024]);
  });

  it("ignores a start date saved in a prior season", () => {
    const prefs = buildFieldPrefs({ ...defaults(), startDate: "2025-03-01" }, { gddChartMode: "cumulative", etChartMode: "cropEt", chillModel: "portions" }, "tomato");
    expect(mergeGraphSettings(defaults(), prefs, CONTEXT).startDate).toBe(defaults().startDate);
  });

  it("preserves newly added default flags absent from older saved prefs", () => {
    const prefs = buildFieldPrefs(defaults(), { gddChartMode: "cumulative", etChartMode: "cropEt", chillModel: "portions" }, "tomato");
    delete (prefs.show as Record<string, unknown>).climatologyBand;
    expect(mergeGraphSettings(defaults(), prefs, CONTEXT).show.climatologyBand).toBe(true);
  });
});

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  (globalThis as unknown as { window: { localStorage: typeof localStorage } }).window = { localStorage };
}

describe("localPreferencesRepository", () => {
  beforeEach(() => installLocalStorageMock());

  it("round-trips and clears per-field prefs", () => {
    const prefs = buildFieldPrefs({ ...defaults(), forecastDays: 14 }, { gddChartMode: "daily", etChartMode: "precip", chillModel: "portions" }, "tomato");
    localPreferencesRepository.save("field-a", prefs);
    expect(localPreferencesRepository.load("field-a")?.forecastDays).toBe(14);
    expect(localPreferencesRepository.load("field-b")).toBeUndefined();
    localPreferencesRepository.clear("field-a");
    expect(localPreferencesRepository.load("field-a")).toBeUndefined();
  });

  it("keeps other fields' prefs when clearing one", () => {
    localPreferencesRepository.save("field-a", buildFieldPrefs(defaults(), { gddChartMode: "daily", etChartMode: "cropEt", chillModel: "portions" }, "tomato"));
    localPreferencesRepository.save("field-b", buildFieldPrefs(defaults(), { gddChartMode: "cumulative", etChartMode: "precip", chillModel: "portions" }, "almond"));
    localPreferencesRepository.clear("field-a");
    expect(localPreferencesRepository.load("field-b")?.etChartMode).toBe("precip");
  });
});
