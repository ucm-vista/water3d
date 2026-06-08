import type { CropId, FieldConfig, WeatherRecord } from "../types/domain";

export interface ApiDateRange {
  startDate: string;
  endDate: string;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface ApiMetadata {
  provider: "mapbox" | "openet" | "nrcs-soil-data-access" | "catherine" | "climate" | "local" | "unknown";
  generatedAt?: string;
  qualityFlags?: string[];
  sourceUrl?: string;
  requestId?: string;
}

export interface LocationSearchResult extends Coordinates {
  id: string;
  label: string;
  placeName?: string;
  county?: string;
  region?: string;
  timezone?: string;
  metadata: ApiMetadata;
}

export interface FieldSetupContext extends Coordinates {
  label: string;
  county?: string;
  region?: string;
  timezone?: string;
  soilTexture: string;
  awhcMmPerM: number;
  soilMapUnitKey?: string;
  soilMapUnitName?: string;
  soilComponentName?: string;
  soilComponentPercent?: number;
  hydrologicGroup?: string;
  drainageClass?: string;
  weatherCellId: string;
  weatherProvider?: string;
  elevationFt: number;
  metadata: ApiMetadata;
}

export interface WeatherDataRequest extends ApiDateRange, Coordinates {
  cropId: CropId;
  timezone?: string;
  weatherCellId?: string;
}

export interface WeatherDataResponse {
  records: WeatherRecord[];
  forecastRecords?: WeatherRecord[];
  metadata: ApiMetadata;
}

export interface HistoricalComparisonPoint {
  date: string;
  etoMm?: number;
  etcMm?: number;
  gdd?: number;
}

export interface EtDataRequest extends ApiDateRange, Coordinates {
  cropId: CropId;
  fieldId?: string;
}

export type EtDataVariable = "ET" | "ETo" | "PR" | "ETof" | "NDVI" | "MODEL_COUNT";

export interface EtDataResponse {
  records: Array<{
    date: string;
    etoMm?: number;
    etActualMm?: number;
    etReferenceMm?: number;
    forecastPetP10Mm?: number;
    forecastPetP90Mm?: number;
    precipMm?: number;
    ndvi?: number;
    modelCount?: number;
    source: "historical" | "forecast";
  }>;
  historicalComparison?: HistoricalComparisonPoint[];
  metadata: ApiMetadata;
}

export interface AppliedWaterRecord {
  date: string;
  appliedMm: number;
  source: "user" | "meter" | "irrigation-system" | "local";
}

export interface AppliedWaterRequest extends ApiDateRange {
  fieldId: string;
}

export interface AppliedWaterResponse {
  records: AppliedWaterRecord[];
  metadata: ApiMetadata;
}

export interface HistoricalBaselineRequest extends ApiDateRange, Coordinates {
  cropId: CropId;
  years?: number[];
}

export interface HistoricalBaselineResponse {
  records: HistoricalComparisonPoint[];
  metadata: ApiMetadata;
}

export interface LocationProvider {
  search(query: string): Promise<LocationSearchResult[]>;
  getFieldSetupContext(location: Coordinates): Promise<FieldSetupContext>;
}

export interface WeatherProvider {
  getDailyWeather(request: WeatherDataRequest): Promise<WeatherDataResponse>;
}

export interface EtProvider {
  getEtData(request: EtDataRequest): Promise<EtDataResponse>;
}

export interface AppliedWaterProvider {
  getAppliedWater(request: AppliedWaterRequest): Promise<AppliedWaterResponse>;
}

export interface HistoricalBaselineProvider {
  getHistoricalBaseline(request: HistoricalBaselineRequest): Promise<HistoricalBaselineResponse>;
}

export interface FieldStorageProvider {
  listFields(): Promise<FieldConfig[]>;
  saveField(field: FieldConfig): Promise<FieldConfig>;
}
