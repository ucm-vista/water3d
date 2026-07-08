import type { EtUnit, UnitSystem } from "../utils/units";

export const MAX_COMPARISON_YEARS = 4;

export type GraphSettingsSection = "season" | "comparison" | "targets" | "display" | "axis";

export interface GraphSeriesVisibility {
  stages: boolean;
  stageLabels: boolean;
  currentSeason: boolean;
  fiveYearNormal: boolean;
  selectedYears: boolean;
  forecast: boolean;
  projection: boolean;
  referenceEt: boolean;
  etReferencePriorYear: boolean;
  etReferenceNormal: boolean;
  etCumulative: boolean;
  etDailyBars: boolean;
  forecastBand: boolean;
  dataMarkers: boolean;
}

export interface GraphSettings {
  startDate: string;
  endDate: string;
  forecastDays: number;
  comparisonYears: number[];
  selectedComparisonYears: number[];
  gddBaseTempC: number;
  gddUpperTempC: number;
  chillThresholdMinC: number;
  chillThresholdMaxC: number;
  etUnit: EtUnit;
  yAxisMax: number | null;
  unitSystem: UnitSystem;
  show: GraphSeriesVisibility;
}

export interface GraphSettingsDefaultsInput {
  startDate: string;
  endDate: string;
  forecastDays: number;
  comparisonYears: number[];
  selectedComparisonYears: number[];
  gddBaseTempC: number;
  gddUpperTempC: number;
  chillThresholdMinC: number;
  chillThresholdMaxC: number;
  unitSystem: UnitSystem;
}

export function buildDefaultGraphSettings(input: GraphSettingsDefaultsInput): GraphSettings {
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    forecastDays: input.forecastDays,
    comparisonYears: sortYears(input.comparisonYears),
    selectedComparisonYears: sortYears(input.selectedComparisonYears).slice(-MAX_COMPARISON_YEARS),
    gddBaseTempC: input.gddBaseTempC,
    gddUpperTempC: input.gddUpperTempC,
    chillThresholdMinC: input.chillThresholdMinC,
    chillThresholdMaxC: input.chillThresholdMaxC,
    etUnit: "in",
    yAxisMax: null,
    unitSystem: input.unitSystem,
    show: {
      stages: true,
      stageLabels: true,
      currentSeason: true,
      fiveYearNormal: true,
      selectedYears: true,
      forecast: true,
      projection: true,
      referenceEt: true,
      etReferencePriorYear: true,
      etReferenceNormal: true,
      etCumulative: true,
      etDailyBars: true,
      forecastBand: true,
      dataMarkers: false,
    },
  };
}

function sortYears(years: number[]): number[] {
  return [...new Set(years)].sort((left, right) => left - right);
}

// Stable serialization for dirty detection (year order independent).
export function serializeGraphSettings(settings: GraphSettings): string {
  return JSON.stringify({
    ...settings,
    comparisonYears: sortYears(settings.comparisonYears),
    selectedComparisonYears: sortYears(settings.selectedComparisonYears),
  });
}

export function graphSettingsEqual(a: GraphSettings, b: GraphSettings): boolean {
  return serializeGraphSettings(a) === serializeGraphSettings(b);
}

export const FORECAST_RANGE_OPTIONS = [0, 7, 14, 28] as const;
