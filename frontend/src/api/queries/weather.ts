// Network-backed weather queries. Each hook wraps a provider call in a cached,
// deduped, persisted query keyed on coordinates + date range. These replace the
// Dashboard's hand-rolled fetch effects; the provider-level caches still sit
// underneath as an inner dedupe layer.

import { useQueries, useQuery } from "@tanstack/react-query";
import { climateToolboxApi, climateToolboxProvider } from "../climate";
import { getGridMetAvailableThrough, gridMetApi, gridMetProvider } from "../gridMet";
import { openMeteoApi, openMeteoProvider } from "../openMeteo";
import type { WeatherRecordSupplement } from "../contracts";
import type { CropId, WeatherRecord } from "../../types/domain";
import { addUtcDays, toIsoDate } from "../../utils/dateRange";
import { debugDataSource } from "../../utils/debug";
import { weatherKeys, weatherSignature } from "./keys";
import { TTL } from "./ttl";

// Last-write-wins merge of historical + forecast records onto one date axis,
// with "historical" winning any overlap. Lives here (not the Dashboard) because
// the season query produces the merged series.
export function mergeWeatherRecords(records: WeatherRecord[]): WeatherRecord[] {
  const byDate = new Map<string, WeatherRecord>();
  for (const record of records) {
    const existing = byDate.get(record.date);
    if (!existing || existing.source === "forecast") byDate.set(record.date, record);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface SeasonWeatherResult {
  records: WeatherRecord[];
  warnings: string[];
}

// gridMET history lags ~2 days and the CFS endpoint starts wherever its latest
// model run starts (it ignores our requested start date), so 1-3 recent days
// routinely fall in neither source — and their GDD would silently drop out of
// the cumulative series. This computes the uncovered window, which is then
// backfilled from the Open-Meteo forecast API (its past days are
// observation-assimilated analysis, validated within ~1 GDD/day of gridMET).
// Capped so a provider outage can't turn the backfill into a season-length
// pull from a source we only trust for the recent tail.
export const MAX_SEAM_BACKFILL_DAYS = 14;

export function seamBackfillRange(input: {
  lastHistoricalDate?: string;
  firstForecastDate?: string;
  todayIso: string;
}): { startDate: string; endDate: string } | null {
  const { lastHistoricalDate, firstForecastDate, todayIso } = input;
  // Without any history there is no seam to fill — the gap is the whole season,
  // which is an outage for the existing warning to report, not a backfill case.
  if (!lastHistoricalDate) return null;

  const shiftDays = (iso: string, days: number) => toIsoDate(addUtcDays(new Date(`${iso}T00:00:00Z`), days));

  let endDate = todayIso;
  if (firstForecastDate) {
    const dayBeforeForecast = shiftDays(firstForecastDate, -1);
    if (dayBeforeForecast < endDate) endDate = dayBeforeForecast;
  }

  let startDate = shiftDays(lastHistoricalDate, 1);
  const cappedStart = shiftDays(endDate, -(MAX_SEAM_BACKFILL_DAYS - 1));
  if (startDate < cappedStart) startDate = cappedStart;

  return startDate <= endDate ? { startDate, endDate } : null;
}

export function applyWeatherSupplements(
  records: WeatherRecord[],
  supplements: WeatherRecordSupplement[],
): WeatherRecord[] {
  const supplementsByDate = new Map(supplements.map((record) => [record.date, record]));
  return records.map((record) => ({ ...record, ...supplementsByDate.get(record.date), date: record.date }));
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

// Current-season weather is deliberately staged. The first query requests only
// tmin/tmax, which is everything the default GDD chart needs. Once that query
// succeeds, a second persisted query enriches those same records with ET and
// precipitation without fetching the temperatures again.
export function useSeasonWeather(params: SeasonWeatherParams) {
  const { cropId, lat, lon, fieldId, seasonStartDate, todayIso, forecastEndDate } = params;
  const gddQuery = useQuery({
    queryKey: weatherKeys.seasonGdd(lat, lon, seasonStartDate, todayIso),
    enabled: seasonWeatherEnabled,
    staleTime: TTL.seasonWeather,
    queryFn: async (): Promise<SeasonWeatherResult> => {
      const warnings: string[] = [];
      const merged: WeatherRecord[] = [];

      const [historicalResult, forecastResult] = await Promise.allSettled([
        gridMetApi.enabled
          ? gridMetProvider.getDailyWeather({
              cropId,
              lat,
              lon,
              startDate: seasonStartDate,
              endDate: todayIso,
              variableProfile: "temperature",
            })
          : Promise.reject(new Error("gridMET historical weather is not enabled.")),
        climateToolboxApi.enabled
          ? climateToolboxProvider.getForecastWeather({
              cropId,
              lat,
              lon,
              startDate: todayIso,
              endDate: forecastEndDate,
              variableProfile: "temperature",
            })
          : Promise.reject(new Error("Climate Toolbox forecast weather is not enabled.")),
      ]);

      let gridMetAvailableThrough: string | undefined;
      if (historicalResult.status === "fulfilled") {
        merged.push(...historicalResult.value.records);
        gridMetAvailableThrough = getGridMetAvailableThrough(historicalResult.value.metadata.qualityFlags);
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

      // Fill the seam between gridMET's lagged tail and the first CFS day from
      // the Open-Meteo forecast API. Tagged "forecast", the filled days render
      // on the dashed line and are replaced by gridMET as it catches up.
      const seamRange = seamBackfillRange({
        lastHistoricalDate: historicalResult.status === "fulfilled" ? historicalResult.value.records.at(-1)?.date : undefined,
        firstForecastDate: forecastResult.status === "fulfilled" ? forecastResult.value.forecastRecords?.[0]?.date : undefined,
        todayIso,
      });
      let seamFilled = false;
      if (seamRange && openMeteoApi.enabled) {
        try {
          const backfill = await openMeteoProvider.getRecentDailyWeather({
            cropId,
            lat,
            lon,
            startDate: seamRange.startDate,
            endDate: seamRange.endDate,
          });
          merged.push(...backfill.records.filter((record) => record.date >= seamRange.startDate && record.date <= seamRange.endDate));
          seamFilled = true;
        } catch (error) {
          debugDataSource("open-meteo", "seam backfill request failed", { fieldId, error: String(error) });
        }
      }

      if (gridMetAvailableThrough) {
        warnings.push(
          seamFilled && seamRange
            ? `gridMET history is available through ${gridMetAvailableThrough}; ${seamRange.startDate} to ${seamRange.endDate} are estimated from Open-Meteo until gridMET catches up.`
            : `gridMET history is available through ${gridMetAvailableThrough} (the most recent days typically lag by ~2 days).`,
        );
      }

      // Nothing usable came back: surface as an error so it retries and is never
      // cached as an (empty) success.
      if (!merged.length) {
        throw new Error(warnings.join(" ") || "No weather data could be loaded for this field.");
      }

      return { records: mergeWeatherRecords(merged), warnings };
    },
  });

  const detailQuery = useQuery({
    queryKey: weatherKeys.seasonDetails(
      lat,
      lon,
      seasonStartDate,
      todayIso,
      weatherSignature(gddQuery.data?.records ?? []),
    ),
    enabled: seasonWeatherEnabled && gddQuery.isSuccess && Boolean(gddQuery.data?.records.length),
    staleTime: TTL.seasonWeather,
    queryFn: async (): Promise<SeasonWeatherResult> => {
      const base = gddQuery.data as SeasonWeatherResult;
      const warnings = [...base.warnings];
      const historicalRecords = base.records.filter((record) => record.source === "historical");
      const forecastRecords = base.records.filter((record) => record.source === "forecast");

      const [historicalResult, forecastResult] = await Promise.allSettled([
        gridMetApi.enabled && historicalRecords.length
          ? gridMetProvider.getDailyWeatherSupplement({
              cropId,
              lat,
              lon,
              startDate: seasonStartDate,
              endDate: todayIso,
            })
          : Promise.reject(new Error("No historical GDD records are available to enrich.")),
        climateToolboxApi.enabled && forecastRecords.length
          ? climateToolboxProvider.getForecastWeatherSupplement(
              { cropId, lat, lon, startDate: todayIso, endDate: forecastEndDate },
              forecastRecords,
            )
          : Promise.reject(new Error("No forecast GDD records are available to enrich.")),
      ]);

      let enrichedHistorical = historicalRecords;
      let enrichedForecast = forecastRecords;
      if (historicalResult.status === "fulfilled") {
        enrichedHistorical = applyWeatherSupplements(historicalRecords, historicalResult.value.records);
        if (historicalResult.value.qualityFlags.includes("missing-variable:pr")) {
          warnings.push("gridMET precipitation was unavailable — the precipitation view will show zeros for historical days.");
        }
      } else if (gridMetApi.enabled && historicalRecords.length) {
        warnings.push(
          historicalResult.reason instanceof Error
            ? historicalResult.reason.message
            : "gridMET ET and precipitation could not be loaded.",
        );
        debugDataSource("gridmet", "background weather request failed", {
          fieldId,
          error: String(historicalResult.reason),
        });
      }

      if (forecastResult.status === "fulfilled") {
        enrichedForecast = applyWeatherSupplements(forecastRecords, forecastResult.value.records);
        if (forecastResult.value.qualityFlags.includes("missing-variable:pr")) {
          warnings.push("Climate Toolbox precipitation was unavailable — the forecast precipitation view will show zeros.");
        }
      } else if (climateToolboxApi.enabled && forecastRecords.length) {
        warnings.push(
          forecastResult.reason instanceof Error
            ? forecastResult.reason.message
            : "Climate Toolbox ET and precipitation forecast could not be loaded.",
        );
        debugDataSource("climate-toolbox", "background forecast request failed", {
          fieldId,
          error: String(forecastResult.reason),
        });
      }

      return { records: mergeWeatherRecords([...enrichedHistorical, ...enrichedForecast]), warnings };
    },
  });

  return {
    ...gddQuery,
    data: detailQuery.data ?? gddQuery.data,
    hasDetails: detailQuery.isSuccess,
    isBackgroundFetching: detailQuery.isFetching,
  };
}

interface ChillWeatherParams {
  cropId: CropId;
  lat: number;
  lon: number;
  fieldId: string;
  chillSeasonStart?: string;
  todayIso: string;
  enabled?: boolean;
}

// Open-Meteo daily + hourly weather for chill-hour accounting. Disabled (and
// thus empty) when the crop has no chill season.
export function useChillWeather(params: ChillWeatherParams) {
  const { cropId, lat, lon, fieldId, chillSeasonStart, todayIso, enabled = true } = params;
  return useQuery({
    queryKey: weatherKeys.chill(lat, lon, chillSeasonStart ?? "", todayIso),
    enabled: enabled && openMeteoApi.enabled && Boolean(chillSeasonStart),
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
  enabled?: boolean;
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
  const { cropId, lat, lon, years, currentYear, enabled = true } = params;
  return useQueries({
    queries: years.map((year) => ({
      queryKey: weatherKeys.year(lat, lon, year, "temperature_et" as const),
      enabled: enabled && gridMetApi.enabled,
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
