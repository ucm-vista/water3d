// Barrel for the field-data cache layer (TanStack Query hooks + helpers).
export { mergeWeatherRecords, seasonWeatherEnabled, useChillWeather, useSeasonWeather, useYearWeather } from "./weather";
export type { SeasonWeatherResult, YearWeatherResult } from "./weather";
export { useAnalyticsSnapshot, useChillSeries, useStageProjections } from "./computations";
export { CLIMATOLOGY_YEARS, useClimatology } from "./climatology";
export type { ClimatologyResult } from "./climatology";
export { useChillClimatology } from "./chillClimatology";
export type { ChillClimatologyResult } from "./chillClimatology";
export { weatherKeys } from "./keys";
