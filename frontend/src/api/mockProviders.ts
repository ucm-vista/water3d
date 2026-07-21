import { defaultFields } from "../data/fields";
import { mockWeatherRecords } from "../data/weather";
import type {
  Coordinates,
  EtDataRequest,
  EtDataResponse,
  FieldSetupContext,
  LocationProvider,
  LocationSearchResult,
  WeatherDataRequest,
  WeatherDataResponse,
  WeatherProvider,
  EtProvider,
} from "./contracts";

export class MockLocationProvider implements LocationProvider {
  async search(query: string): Promise<LocationSearchResult[]> {
    const field = defaultFields[0];
    return [
      {
        id: "mock-green-valley",
        label: query || field.name,
        placeName: "Fresno County, CA",
        county: "Fresno",
        region: "Central Valley",
        timezone: "America/Los_Angeles",
        lat: field.lat,
        lon: field.lon,
        metadata: { provider: "local" },
      },
    ];
  }

  async getFieldSetupContext(location: Coordinates): Promise<FieldSetupContext> {
    return {
      ...location,
      label: "Green Valley Ranch",
      weatherCellId: "Grid ID #4829",
      elevationFt: 342,
      metadata: { provider: "local" },
    };
  }
}

export class MockWeatherProvider implements WeatherProvider {
  async getDailyWeather(_request: WeatherDataRequest): Promise<WeatherDataResponse> {
    return {
      records: mockWeatherRecords,
      metadata: {
        provider: "local",
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export class MockEtProvider implements EtProvider {
  async getEtData(_request: EtDataRequest): Promise<EtDataResponse> {
    return {
      records: mockWeatherRecords.map((record) => ({
        date: record.date,
        etoMm: record.etoMm,
        etReferenceMm: record.etoMm,
        source: record.source,
      })),
      historicalComparison: mockWeatherRecords.map((record) => ({
        date: record.date,
        etoMm: Number((record.etoMm * 0.9).toFixed(1)),
      })),
      metadata: {
        provider: "local",
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export const mockLocationProvider = new MockLocationProvider();
export const mockWeatherProvider = new MockWeatherProvider();
export const mockEtProvider = new MockEtProvider();
