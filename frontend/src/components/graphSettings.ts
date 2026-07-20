export const MAX_COMPARISON_YEARS = 4;

export type GraphSettingsSection = "season" | "comparison" | "targets" | "display" | "axis";

export interface GraphSeriesVisibility {
  stages: boolean;
  stageLabels: boolean;
  currentSeason: boolean;
  climatologyNormal: boolean;
  climatologyBand: boolean;
  selectedYears: boolean;
  forecast: boolean;
  projection: boolean;
  etReferencePriorYear: boolean;
  etReferenceNormal: boolean;
  etDailyBars: boolean;
  forecastBand: boolean;
  precipDailyBars: boolean;
  precipNormal: boolean;
  precipBand: boolean;
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
  yAxisMax: number | null;
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
    yAxisMax: null,
    show: {
      stages: true,
      stageLabels: true,
      currentSeason: true,
      climatologyNormal: true,
      climatologyBand: true,
      selectedYears: true,
      forecast: true,
      projection: true,
      etReferencePriorYear: true,
      etReferenceNormal: true,
      etDailyBars: true,
      forecastBand: true,
      precipDailyBars: true,
      precipNormal: true,
      precipBand: true,
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
