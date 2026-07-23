export type CropId = "almond" | "tomato" | "wineGrape" | "alfalfa" | "pistachio" | "cotton" | "other";

export type WeatherSource = "historical" | "forecast";

export interface StageThreshold {
  label: string;
  gdd: number | null;
  note?: string;
  confidence?: "placeholder" | "provisional" | "source-backed" | "mock";
}

export interface KcPoint {
  position: number;
  kc: number;
}

export interface StressThresholds {
  frostCriticalC?: number;
  heatCriticalC?: number;
  highVpdKpa: number;
}

export interface CropProfile {
  id: CropId;
  label: string;
  varietyHint?: string;
  tBaseC: number;
  tUpperC: number;
  kcCurve: KcPoint[];
  stages: StageThreshold[];
  madFraction: number;
  rootDepthM: number;
  tawMmPerM: number;
  chillRequirementPortions?: number;
  stress: StressThresholds;
}

export interface FieldConfig {
  id: string;
  name: string;
  cropId: CropId;
  cropLabel: string;
  lat: number;
  lon: number;
  stageStartDate: string;
  areaAcres?: number;
  gddBaseTempC?: number;
  gddUpperTempC?: number;
  /** Flat crop-coefficient override; unset = the crop profile's stage-varying Kc curve. */
  kcOverride?: number;
  stageThresholds?: StageThreshold[];
  rootDepthM?: number;
  madFraction?: number;
  irrigationEfficiency?: number;
  weatherCell?: string;
  elevationFt?: number;
}

export interface WeatherRecord {
  date: string;
  tminC: number;
  tmaxC: number;
  precipMm: number;
  etoMm: number;
  forecastPetP10Mm?: number;
  forecastPetP90Mm?: number;
  source: WeatherSource;
  rhMin?: number;
  rhMax?: number;
  tdewC?: number;
  vpdKpa?: number;
  hourlyTempsC?: number[];
}

export interface DailyAnalytics {
  date: string;
  gdd: number;
  cumulativeGdd: number;
  kc: number;
  etcMm: number;
  cumulativeEtcMm: number;
  cumulativeEtoMm: number;
  vpdKpa?: number;
}

export interface AnalyticsSnapshot {
  field: FieldConfig;
  crop: CropProfile;
  records: DailyAnalytics[];
  currentGdd: number;
  currentStage: StageThreshold;
  nextStage?: StageThreshold;
  currentKc: number;
  cumulativeEtcMm: number;
  cumulativeEtoMm: number;
  chillPortions?: number;
  chillRequirement?: number;
  stressLevel: "low" | "moderate" | "high";
  vpdKpa?: number;
  insights: string[];
}
