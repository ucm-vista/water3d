export type CropId = "almond" | "tomato" | "wineGrape" | "alfalfa" | "pistachio" | "cotton";

export type WeatherSource = "historical" | "forecast";

export interface StageThreshold {
  label: string;
  gdd: number;
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
  soilTexture: string;
  awhcMmPerM: number;
  soilMapUnitKey?: string;
  soilMapUnitName?: string;
  soilComponentName?: string;
  soilComponentPercent?: number;
  hydrologicGroup?: string;
  drainageClass?: string;
  rootDepthM: number;
  madFraction: number;
  stageStartDate: string;
  stageThresholds?: StageThreshold[];
  irrigationEfficiency: number;
  weatherCell: string;
  elevationFt: number;
}

export interface WeatherRecord {
  date: string;
  tminC: number;
  tmaxC: number;
  precipMm: number;
  etoMm: number;
  forecastPetP10Mm?: number;
  forecastPetP90Mm?: number;
  etActualMm?: number;
  ndvi?: number;
  modelCount?: number;
  source: WeatherSource;
  rhMin?: number;
  rhMax?: number;
  tdewC?: number;
  hourlyTempsC?: number[];
}

export interface DailyAnalytics {
  date: string;
  gdd: number;
  cumulativeGdd: number;
  kc: number;
  etcMm: number;
  cumulativeEtcMm: number;
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
