// Network-backed weather queries. Each hook wraps a provider call in a cached,
// deduped, persisted query keyed on coordinates + date range. These replace the
// Dashboard's hand-rolled fetch effects; the provider-level caches still sit
// underneath as an inner dedupe layer.

import { useQueries, useQuery } from "@tanstack/react-query";
import { climateToolboxApi, climateToolboxProvider } from "../climate";
import { getGridMetAvailableThrough, gridMetApi, gridMetProvider } from "../gridMet";
import { openMeteoApi, openMeteoProvider } from "../openMeteo";
import type { CropId, WeatherRecord } from "../../types/domain";
import { debugDataSource } from "../../utils/debug";
import { weatherKeys } from "./keys";
import { TTL } from "./ttl";

// Last-write-wins merge of historical + forecast records onto one date axis,
// with "historical" winning any overlap. Lives here (not the Dashboard) because
// the season query produces the merged series.
export function mergeWeatherRecords(records: WeatherRecord[]): WeatherRecord[] {
  const byDate = new Map<string, WeatherRecord>();
  for (const record of records) {
    const existing = byDate.get(record.date);
    byDate.set(record.date, {
      ...(existing ?? record),
      ...record,
      source: existing?.source === "historical" || record.source === "historical" ? "historical" : "forecast",
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface SeasonWeatherResult {
  records: WeatherRecord[];
  warnings: string[];
}

interface SeasonWeatherParams {
  cropId: CropId;
  lat: number;
  lon: number;
  fieldId: string;
  seasonStartDate: string;
  todayIso: string;
  forecastEndDate: string;
}

export const seasonWeatherEnabled = gridMetApi.enabled || climateToolboxApi.enabled;

// Current-season weather: gridMET history (Jan 1 -> today) merged with the
// Climate Toolbox forecast. Throws only when every enabled source fails (so the
// failure isn't cached); partial success returns data plus warnings.
export function useSeasonWeather(params: SeasonWeatherParams) {
  const { cropId, lat, lon, fieldId, seasonStartDate, todayIso, forecastEndDate } = params;
  return useQuery({
    queryKey: weatherKeys.season(lat, lon, seasonStartDate, todayIso),
    enabled: seasonWeatherEnabled,
    staleTime: TTL.seasonWeather,
    queryFn: async (): Promise<SeasonWeatherResult> => {
      const warnings: string[] = [];
      const merged: WeatherRecord[] = [];

      const [historicalResult, forecastResult] = await Promise.allSettled([
        gridMetApi.enabled
          ? gridMetProvider.getDailyWeather({ cropId, lat, lon, startDate: seasonStartDate, endDate: todayIso })
          : Promise.reject(new Error("gridMET historical weather is not enabled.")),
        climateToolboxApi.enabled
          ? climateToolboxProvider.getForecastWeather({ cropId, lat, lon, startDate: todayIso, endDate: forecastEndDate })
          : Promise.reject(new Error("Climate Toolbox forecast weather is not enabled.")),
      ]);

      if (historicalResult.status === "fulfilled") {
        merged.push(...historicalResult.value.records);
        const availableThrough = getGridMetAvailableThrough(historicalResult.value.metadata.qualityFlags);
        if (availableThrough) {
          warnings.push(`gridMET history is available through ${availableThrough} (the most recent days typically lag by ~2 days).`);
        }
        if (historicalResult.value.metadata.qualityFlags?.includes("missing-variable:pr")) {
          warnings.push("gridMET precipitation was unavailable — the precipitation view will show zeros for historical days.");
        }
      } else if (gridMetApi.enabled) {
        warnings.push(historicalResult.reason instanceof Error ? historicalResult.reason.message : "gridMET historical weather could not be loaded.");
        debugDataSource("gridmet", "historical weather request failed", { fieldId, error: String(historicalResult.reason) });
      }

      if (forecastResult.status === "fulfilled") {
        merged.push(...(forecastResult.value.forecastRecords ?? []));
      } else if (climateToolboxApi.enabled) {
        warnings.push(forecastResult.reason instanceof Error ? forecastResult.reason.message : "Climate Toolbox forecast weather could not be loaded.");
        debugDataSource("climate-toolbox", "forecast weather request failed", { fieldId, error: String(forecastResult.reason) });
      }

      // Nothing usable came back: surface as an error so it retries and is never
      // cached as an (empty) success.
      if (!merged.length) {
        throw new Error(warnings.join(" ") || "No weather data could be loaded for this field.");
      }

      return { records: mergeWeatherRecords(merged), warnings };
    },
  });
}

interface ChillWeatherParams {
  cropId: CropId;
  lat: number;
  lon: number;
  fieldId: string;
  chillSeasonStart?: string;
  todayIso: string;
}

// Open-Meteo daily + hourly weather for chill-hour accounting. Disabled (and
// thus empty) when the crop has no chill season.
export function useChillWeather(params: ChillWeatherParams) {
  const { cropId, lat, lon, fieldId, chillSeasonStart, todayIso } = params;
  return useQuery({
    queryKey: weatherKeys.chill(lat, lon, chillSeasonStart ?? "", todayIso),
    enabled: openMeteoApi.enabled && Boolean(chillSeasonStart),
    staleTime: TTL.chillWeather,
    queryFn: async (): Promise<WeatherRecord[]> => {
      try {
        const response = await openMeteoProvider.getDailyWeather({
          cropId,
          lat,
          lon,
          startDate: chillSeasonStart as string,
          endDate: todayIso,
        });
        return response.records;
      } catch (error) {
        debugDataSource("open-meteo", "chill season weather request failed", {
          fieldId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  });
}

interface YearWeatherParams {
  cropId: CropId;
  lat: number;
  lon: number;
  years: number[];
  currentYear: number;
}

export interface YearWeatherResult {
  byYear: Record<number, WeatherRecord[]>;
  isFetching: boolean;
}

// Per-year history (temps + reference ET) for the comparison-year
// overlays — temps drive the GDD overlays, reference ETo drives the ET overlays.
// One cached query per year, so toggling which years are shown never
// refetches a year already loaded this session. Prior years get a long TTL
// (immutable); the current year a short one (still accumulating).
export function useYearWeather(params: YearWeatherParams): YearWeatherResult {
  const { cropId, lat, lon, years, currentYear } = params;
  return useQueries({
    queries: years.map((year) => ({
      queryKey: weatherKeys.year(lat, lon, year, "temperature_et" as const),
      enabled: gridMetApi.enabled,
      staleTime: year >= currentYear ? TTL.currentYearWeather : TTL.priorYearWeather,
      queryFn: async (): Promise<WeatherRecord[]> => {
        const response = await gridMetProvider.getDailyWeather({
          cropId,
          lat,
          lon,
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
          variableProfile: "temperature_et",
        });
        return response.records;
      },
    })),
    combine: (results) => {
      const byYear: Record<number, WeatherRecord[]> = {};
      results.forEach((result, index) => {
        if (result.data?.length) byYear[years[index]] = result.data;
      });
      return { byYear, isFetching: results.some((result) => result.isFetching) };
    },
  });
}
