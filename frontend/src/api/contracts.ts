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
  provider: "mapbox" | "openet" | "catherine" | "climate" | "local" | "unknown";
  generatedAt?: string;
  qualityFlags?: string[];
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
  soilTexture: string;
  awhcMmPerM: number;
  weatherCellId: string;
  elevationFt: number;
  metadata: ApiMetadata;
}

export interface WeatherDataRequest extends ApiDateRange, Coordinates {
  cropId: CropId;
}

export interface WeatherDataResponse {
  records: WeatherRecord[];
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
}

export interface EtDataResponse {
  records: Array<{
    date: string;
    etoMm?: number;
    etActualMm?: number;
    etReferenceMm?: number;
    source: "historical" | "forecast";
  }>;
  historicalComparison?: HistoricalComparisonPoint[];
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

export interface FieldStorageProvider {
  listFields(): Promise<FieldConfig[]>;
  saveField(field: FieldConfig): Promise<FieldConfig>;
}
