import { openMeteoConfig, getOpenMeteoArchiveUrl } from "../config/openMeteo";
import type { WeatherRecord } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { WeatherDataRequest, WeatherDataResponse } from "./contracts";

interface OpenMeteoHistoricalPayload {
  daily?: {
    time?: string[];
    temperature_2m_min?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    et0_fao_evapotranspiration?: Array<number | null>;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    dew_point_2m?: Array<number | null>;
  };
}

export const openMeteoApi = {
  enabled: openMeteoConfig.enabled,
  urls: {
    archive: getOpenMeteoArchiveUrl(),
  },
};

const openMeteoResponseCache = new Map<string, WeatherDataResponse>();

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function average(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

export function parseOpenMeteoHistoricalWeather(payload: OpenMeteoHistoricalPayload): WeatherRecord[] {
  const daily = payload.daily;
  if (!daily?.time?.length) {
    return [];
  }

  const hourlyByDate = new Map<string, { temps: number[]; rh: number[]; dewpoints: number[] }>();
  payload.hourly?.time?.forEach((timestamp, index) => {
    const date = timestamp.slice(0, 10);
    const bucket = hourlyByDate.get(date) ?? { temps: [], rh: [], dewpoints: [] };
    const temp = toFiniteNumber(payload.hourly?.temperature_2m?.[index]);
    const rh = toFiniteNumber(payload.hourly?.relative_humidity_2m?.[index]);
    const dewpoint = toFiniteNumber(payload.hourly?.dew_point_2m?.[index]);

    if (typeof temp === "number") bucket.temps.push(round(temp));
    if (typeof rh === "number") bucket.rh.push(round(rh, 0));
    if (typeof dewpoint === "number") bucket.dewpoints.push(round(dewpoint));
    hourlyByDate.set(date, bucket);
  });

  return daily.time
    .map((date, index): WeatherRecord | null => {
      const tminC = toFiniteNumber(daily.temperature_2m_min?.[index]);
      const tmaxC = toFiniteNumber(daily.temperature_2m_max?.[index]);

      if (typeof tminC !== "number" || typeof tmaxC !== "number") {
        return null;
      }

      const hourly = hourlyByDate.get(date);
      const dewpoint = hourly ? average(hourly.dewpoints) : undefined;

      return {
        date,
        tminC: round(tminC),
        tmaxC: round(tmaxC),
        precipMm: round(toFiniteNumber(daily.precipitation_sum?.[index]) ?? 0),
        etoMm: round(toFiniteNumber(daily.et0_fao_evapotranspiration?.[index]) ?? 0),
        source: "historical" as const,
        rhMin: hourly?.rh.length ? Math.min(...hourly.rh) : undefined,
        rhMax: hourly?.rh.length ? Math.max(...hourly.rh) : undefined,
        tdewC: typeof dewpoint === "number" ? round(dewpoint) : undefined,
        hourlyTempsC: hourly?.temps.length ? hourly.temps : undefined,
      };
    })
    .filter((record): record is WeatherRecord => record !== null);
}

export class OpenMeteoProvider {
  private buildArchiveUrl(request: WeatherDataRequest): URL {
    const url = new URL(openMeteoApi.urls.archive, window.location.origin);
    url.searchParams.set("latitude", String(request.lat));
    url.searchParams.set("longitude", String(request.lon));
    url.searchParams.set("start_date", request.startDate);
    url.searchParams.set("end_date", request.endDate);
    url.searchParams.set("timezone", request.timezone ?? "auto");
    url.searchParams.set("temperature_unit", "celsius");
    url.searchParams.set("precipitation_unit", "mm");
    url.searchParams.set("daily", ["temperature_2m_min", "temperature_2m_max", "precipitation_sum", "et0_fao_evapotranspiration"].join(","));
    if (request.includeHourly !== false) {
      url.searchParams.set("hourly", ["temperature_2m", "relative_humidity_2m", "dew_point_2m"].join(","));
    }
    return url;
  }

  async getDailyWeather(request: WeatherDataRequest): Promise<WeatherDataResponse> {
    if (!openMeteoApi.enabled) {
      throw new Error("Open-Meteo historical weather is not enabled.");
    }

    const url = this.buildArchiveUrl(request);
    const cacheKey = url.toString();
    const cached = openMeteoResponseCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Open-Meteo historical weather request failed with ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`);
    }

    const payload = (await response.json()) as OpenMeteoHistoricalPayload;
    debugDataSource("open-meteo", "raw historical weather response", {
      payload,
      requestUrl: url.toString(),
    });

    const records = parseOpenMeteoHistoricalWeather(payload);
    if (!records.length) {
      throw new Error("Open-Meteo did not return usable historical weather records.");
    }

    const result = {
      records,
      metadata: {
        provider: "open-meteo",
        generatedAt: new Date().toISOString(),
        sourceUrl: openMeteoApi.urls.archive,
      },
    };
    openMeteoResponseCache.set(cacheKey, result);
    return result;
  }
}

export const openMeteoProvider = new OpenMeteoProvider();
