import { CalendarDays, Download, Droplets, LoaderCircle, Plus, Snowflake, ThermometerSun, Trash2 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { climateToolboxApi, climateToolboxProvider } from "../api/climate";
import type { EtDataResponse } from "../api/contracts";
import { openMeteoApi, openMeteoProvider } from "../api/openMeteo";
import { getSupportedOpenEtDateRange, openEtApi, openEtProvider, type OpenEtLoadEvent } from "../api/openEt";
import { buildAnalyticsSnapshot } from "../calcs/analytics";
import { cumulativeChillHours } from "../calcs/chillHours";
import { cropProfiles } from "../data/crops";
import { getCropMetricProfile } from "../data/cropMetrics";
import type { FieldConfig, WeatherRecord } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { addUtcDays, getCurrentYearStartDate, getRollingDateRange, toIsoDate } from "../utils/dateRange";
import { MetricCard } from "./MetricCard";
import { useEffect, useMemo, useState } from "react";

interface DashboardProps {
  field: FieldConfig;
}

type EtChartMode = "daily" | "cumulative";
type CropMetricView = "gdd" | "chill";
type EtRecord = EtDataResponse["records"][number];
type LoadFlag = "idle" | "checking" | "fetching" | "saving" | "loaded" | "hit" | "miss" | "disabled" | "error";

interface EtLoadFlags {
  pocketBaseEtData: LoadFlag;
  openEtApi: LoadFlag;
  pocketBaseEtSave: LoadFlag;
  openMeteoWeather: LoadFlag;
  openMeteoComparisons: LoadFlag;
  openMeteoBaseline: LoadFlag;
  climateToolboxWeather: LoadFlag;
}

interface ReferenceLabelProps {
  value?: string;
  viewBox?: {
    x?: number;
    y?: number;
    width?: number;
  };
  dy?: number;
  dx?: number;
  fill?: string;
}

function inches(mm: number): string {
  return `${(mm / 25.4).toFixed(1)}"`;
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

function isOpenEtAvailabilityError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("OpenET data is currently configured through");
}

function mergeEtRecords(records: EtRecord[]): EtRecord[] {
  const byDate = new Map<string, EtRecord>();

  for (const record of records) {
    const existing = byDate.get(record.date);
    byDate.set(record.date, {
      ...(existing ?? { date: record.date, source: record.source }),
      ...record,
      source: existing?.source === "historical" || record.source === "historical" ? "historical" : "forecast",
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildEtDataSourceLabel(records: EtRecord[]): string {
  const hasHistorical = records.some((record) => record.source !== "forecast");
  const hasForecast = records.some((record) => record.source === "forecast");

  if (hasHistorical && hasForecast) return "OpenET + Forecast";
  if (hasHistorical) return "OpenET live";
  if (hasForecast) return "Forecast PET";
  return "ET unavailable";
}

function formatLoadFlag(flag: LoadFlag): string {
  return flag.replace(/^\w/, (letter) => letter.toUpperCase());
}

function StageReferenceLabel({ value = "", viewBox, dy = -8, dx = 0, fill = "#2f6f3a" }: ReferenceLabelProps) {
  if (!viewBox || typeof viewBox.x !== "number" || typeof viewBox.y !== "number" || typeof viewBox.width !== "number") return null;

  const x = viewBox.x + viewBox.width + 12 + dx;
  const y = Math.max(12, viewBox.y + dy);

  const lines = value.split(" / ");

  return (
    <text x={x} y={y + 2} fill={fill} fontSize={11} fontWeight={900} textAnchor="start">
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 0 : 14}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function dayDistance(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function clampDayDistance(startDate: string, endDate: string): number {
  return Math.max(0, dayDistance(startDate, endDate));
}

function getPreviousIsoDate(date: string): string {
  return toIsoDate(addUtcDays(new Date(`${date}T00:00:00Z`), -1));
}

function getIsoYear(date: string): number {
  return Number(date.slice(0, 4));
}

function setIsoYear(date: string, year: number): string {
  return `${year}${date.slice(4)}`;
}

function getBaselineYears(currentYear: number, count = 5): number[] {
  return Array.from({ length: count }, (_, index) => currentYear - count + index);
}

function getUniqueSortedYears(years: number[]): number[] {
  return [...new Set(years)].sort((left, right) => left - right);
}

function mergeWeatherRecords(records: WeatherRecord[]): WeatherRecord[] {
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

export function Dashboard({ field }: DashboardProps) {
  const endDate = useMemo(() => getRollingDateRange(1).endDate, []);
  const seasonStartDate = useMemo(() => getCurrentYearStartDate(), []);
  const defaultStartDate = useMemo(() => field.stageStartDate || getCurrentYearStartDate(), [field.stageStartDate]);
  const [selectedStartDate, setSelectedStartDate] = useState(defaultStartDate);
  const initialCustomGddTarget = useMemo(() => {
    const numericStages = getCropMetricProfile(field.cropId).gdd.stages.filter((stage) => typeof stage.gdd === "number");
    const terminalGdd = numericStages.at(-1)?.gdd ?? 2_500;
    return Math.round((terminalGdd * 0.62) / 25) * 25;
  }, [field.cropId]);
  const [customGddTarget, setCustomGddTarget] = useState(initialCustomGddTarget);
  const dateRange = useMemo(
    () => ({
      startDate: selectedStartDate,
      endDate,
    }),
    [endDate, selectedStartDate],
  );
  const dataLoadRange = useMemo(
    () => ({
      startDate: seasonStartDate,
      endDate,
    }),
    [endDate, seasonStartDate],
  );
  const openEtHistoricalDateRange = useMemo(() => {
    const end = getPreviousIsoDate(dataLoadRange.endDate);
    return {
      startDate: dataLoadRange.startDate.localeCompare(end) > 0 ? end : dataLoadRange.startDate,
      endDate: end,
    };
  }, [dataLoadRange.endDate, dataLoadRange.startDate]);
  const [weatherRecords, setWeatherRecords] = useState<WeatherRecord[]>([]);
  const [comparisonWeatherByYear, setComparisonWeatherByYear] = useState<Record<number, WeatherRecord[]>>({});
  const [baselineWeatherByYear, setBaselineWeatherByYear] = useState<Record<number, WeatherRecord[]>>({});
  const [etRecords, setEtRecords] = useState<EtRecord[]>([]);
  const [etLoading, setEtLoading] = useState(openEtApi.enabled || climateToolboxApi.enabled || openMeteoApi.enabled);
  const [loadFlags, setLoadFlags] = useState<EtLoadFlags>({
    pocketBaseEtData: openEtApi.enabled ? "idle" : "disabled",
    openEtApi: openEtApi.enabled ? "idle" : "disabled",
    pocketBaseEtSave: openEtApi.enabled ? "idle" : "disabled",
    openMeteoWeather: openMeteoApi.enabled ? "idle" : "disabled",
    openMeteoComparisons: openMeteoApi.enabled ? "idle" : "disabled",
    openMeteoBaseline: openMeteoApi.enabled ? "idle" : "disabled",
    climateToolboxWeather: climateToolboxApi.enabled ? "idle" : "disabled",
  });
  const [dataSourceLabel, setDataSourceLabel] = useState(openEtApi.enabled || climateToolboxApi.enabled || openMeteoApi.enabled ? "Loading ET data" : "ET sources disabled");
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [etChartMode, setEtChartMode] = useState<EtChartMode>("cumulative");
  const [cropMetricView, setCropMetricView] = useState<CropMetricView>("gdd");
  const crop = cropProfiles[field.cropId];
  const cropMetrics = getCropMetricProfile(field.cropId);
  const metricStages = field.stageThresholds?.length ? field.stageThresholds : cropMetrics.gdd.stages;
  const metricCrop = useMemo(
    () => ({
      ...crop,
      tBaseC: field.gddBaseTempC ?? cropMetrics.gdd.baseTempC,
      tUpperC: field.gddUpperTempC ?? cropMetrics.gdd.upperTempC,
      stages: metricStages,
    }),
    [crop, cropMetrics.gdd.baseTempC, cropMetrics.gdd.upperTempC, field.gddBaseTempC, field.gddUpperTempC, metricStages],
  );
  const [comparisonYears, setComparisonYears] = useState<number[]>(() => getUniqueSortedYears(cropMetrics.comparisonYears));
  const [selectedComparisonYears, setSelectedComparisonYears] = useState<number[]>([]);
  const [customComparisonYear, setCustomComparisonYear] = useState("");
  const [customComparisonYearError, setCustomComparisonYearError] = useState<string | null>(null);

  useEffect(() => {
    const nextComparisonYears = getUniqueSortedYears(cropMetrics.comparisonYears);
    setComparisonYears(nextComparisonYears);
    setSelectedComparisonYears([]);
    setCustomComparisonYear("");
    setCustomComparisonYearError(null);
    setCropMetricView(cropMetrics.chill.enabled ? "gdd" : "gdd");
  }, [cropMetrics]);

  useEffect(() => {
    setSelectedStartDate(defaultStartDate);
  }, [defaultStartDate, field.id]);

  useEffect(() => {
    setCustomGddTarget(initialCustomGddTarget);
  }, [initialCustomGddTarget]);

  useEffect(() => {
    let ignore = false;

    async function loadEtData() {
      if (!openEtApi.enabled && !climateToolboxApi.enabled && !openMeteoApi.enabled) {
        setEtRecords([]);
        setEtLoading(false);
        setLoadFlags({
          pocketBaseEtData: "disabled",
          openEtApi: "disabled",
          pocketBaseEtSave: "disabled",
          openMeteoWeather: "disabled",
          openMeteoComparisons: "disabled",
          openMeteoBaseline: "disabled",
          climateToolboxWeather: "disabled",
        });
        setDataSourceLabel("ET sources disabled");
        setDataWarning("OpenET, Open-Meteo, and Climate Toolbox are disabled. No ET or weather data will be displayed.");
        return;
      }

      const nextRecords: EtRecord[] = [];
      const nextWeatherRecords: WeatherRecord[] = [];
      const warnings: string[] = [];

      setEtRecords([]);
      setWeatherRecords([]);
      setComparisonWeatherByYear({});
      setBaselineWeatherByYear({});
      setEtLoading(true);
      setDataSourceLabel("Loading ET data");
      setLoadFlags({
        pocketBaseEtData: openEtApi.enabled ? "checking" : "disabled",
        openEtApi: openEtApi.enabled ? "idle" : "disabled",
        pocketBaseEtSave: openEtApi.enabled ? "idle" : "disabled",
        openMeteoWeather: openMeteoApi.enabled ? "fetching" : "disabled",
        openMeteoComparisons: openMeteoApi.enabled ? "idle" : "disabled",
        openMeteoBaseline: openMeteoApi.enabled ? "idle" : "disabled",
        climateToolboxWeather: climateToolboxApi.enabled ? "fetching" : "disabled",
      });

      if (openMeteoApi.enabled) {
        try {
          debugDataSource("open-meteo", "historical weather request started", {
            fieldId: field.id,
            lat: field.lat,
            lon: field.lon,
            startDate: dataLoadRange.startDate,
            endDate: dataLoadRange.endDate,
          });

          const response = await openMeteoProvider.getDailyWeather({
            cropId: field.cropId,
            lat: field.lat,
            lon: field.lon,
            startDate: dataLoadRange.startDate,
            endDate: dataLoadRange.endDate,
          });

          if (ignore) return;

          nextWeatherRecords.push(...response.records);
          setWeatherRecords(mergeWeatherRecords(nextWeatherRecords));
          setEtLoading(false);
          setDataSourceLabel("Open-Meteo weather");
          setLoadFlags((current) => ({ ...current, openMeteoWeather: "loaded" }));
          debugDataSource("open-meteo", "historical weather records loaded into dashboard", {
            fieldId: field.id,
            returnedRecords: response.records.length,
          });
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : "Open-Meteo historical weather could not be loaded.");
          setLoadFlags((current) => ({ ...current, openMeteoWeather: "error" }));
          debugDataSource("open-meteo", "historical weather request failed", {
            fieldId: field.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (openEtApi.enabled) {
        try {
          const openEtDateRange = getSupportedOpenEtDateRange({
            cropId: field.cropId,
            lat: field.lat,
            lon: field.lon,
            startDate: openEtHistoricalDateRange.startDate,
            endDate: openEtHistoricalDateRange.endDate,
          });

          debugDataSource("openet", "request started", {
            fieldId: field.id,
            cropId: field.cropId,
            lat: field.lat,
            lon: field.lon,
            startDate: openEtDateRange.startDate,
            endDate: openEtDateRange.endDate,
            requestUrl: openEtApi.urls.pointTimeseries,
          });

          const response = await openEtProvider.getEtData(
            {
              cropId: field.cropId,
              lat: field.lat,
              lon: field.lon,
              startDate: openEtDateRange.startDate,
              endDate: openEtDateRange.endDate,
            },
            handleOpenEtLoadEvent,
          );

          if (ignore) return;

          nextRecords.push(...response.records);
          debugDataSource("openet", "live records loaded into dashboard", {
            fieldId: field.id,
            returnedRecords: response.records.length,
            recordsWithActualEt: response.records.filter((record) => typeof record.etActualMm === "number").length,
            recordsWithReferenceEt: response.records.filter((record) => typeof record.etoMm === "number").length,
          });
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : "OpenET data could not be loaded.");
          setLoadFlags((current) => ({
            ...current,
            pocketBaseEtData: current.pocketBaseEtData === "checking" ? "error" : current.pocketBaseEtData,
            openEtApi: "error",
          }));
          debugDataSource("openet", isOpenEtAvailabilityError(error) ? "request skipped; date range unavailable" : "request failed", {
            fieldId: field.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (climateToolboxApi.enabled) {
        try {
          debugDataSource("climate-toolbox", "forecast weather request started", {
            fieldId: field.id,
            lat: field.lat,
            lon: field.lon,
          });

          const forecast = await climateToolboxProvider.getForecastWeather({
            cropId: field.cropId,
            lat: field.lat,
            lon: field.lon,
            startDate: dataLoadRange.endDate,
            endDate: toIsoDate(addUtcDays(new Date(`${dataLoadRange.endDate}T00:00:00Z`), 28)),
          });

          if (ignore) return;

          const forecastRecords = forecast.forecastRecords ?? [];
          nextRecords.push(
            ...forecastRecords.map((record) => ({
              date: record.date,
              etoMm: record.etoMm,
              etReferenceMm: record.etoMm,
              forecastPetP10Mm: record.forecastPetP10Mm,
              forecastPetP90Mm: record.forecastPetP90Mm,
              precipMm: record.precipMm,
              source: "forecast" as const,
            })),
          );
          nextWeatherRecords.push(...forecastRecords);
          setLoadFlags((current) => ({ ...current, climateToolboxWeather: "loaded" }));
          debugDataSource("climate-toolbox", "forecast weather records loaded into dashboard", {
            fieldId: field.id,
            returnedRecords: forecastRecords.length,
          });
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : "Climate Toolbox forecast weather could not be loaded.");
          setLoadFlags((current) => ({ ...current, climateToolboxWeather: "error" }));
          debugDataSource("climate-toolbox", "forecast weather request failed", {
            fieldId: field.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (ignore) return;

      const liveRecords = mergeEtRecords(nextRecords);
      setWeatherRecords(mergeWeatherRecords(nextWeatherRecords));
      setEtRecords(liveRecords);
      setEtLoading(false);
      setDataSourceLabel(buildEtDataSourceLabel(liveRecords));
      setDataWarning(warnings.length ? warnings.join(" ") : null);
    }

    void loadEtData();

    return () => {
      ignore = true;
    };
  }, [dataLoadRange.endDate, dataLoadRange.startDate, field.cropId, field.id, field.lat, field.lon, openEtHistoricalDateRange.endDate, openEtHistoricalDateRange.startDate]);

  useEffect(() => {
    if (!openMeteoApi.enabled) return;

    let ignore = false;

    async function fetchComparisonsAndBaselines() {
      const missingComparisons = selectedComparisonYears.filter((year) => !comparisonWeatherByYear[year]);
      const baselineYears = getBaselineYears(Number(dataLoadRange.startDate.slice(0, 4)));
      const missingBaselines = baselineYears.filter((year) => !baselineWeatherByYear[year]);

      if (!missingComparisons.length && !missingBaselines.length) return;

      if (missingComparisons.length) setLoadFlags((current) => ({ ...current, openMeteoComparisons: "fetching" }));
      if (missingBaselines.length) setLoadFlags((current) => ({ ...current, openMeteoBaseline: "fetching" }));

      const nextComparisons: Record<number, WeatherRecord[]> = {};
      const nextBaselines: Record<number, WeatherRecord[]> = {};
      let comparisonError = false;
      let baselineError = false;

      await Promise.all([
        ...missingComparisons.map(async (year) => {
          try {
            const startDate = setIsoYear(dataLoadRange.startDate, year);
            const endDate = setIsoYear(dataLoadRange.endDate, year);
            const response = await openMeteoProvider.getDailyWeather({
              cropId: field.cropId,
              lat: field.lat,
              lon: field.lon,
              startDate,
              endDate,
            });
            nextComparisons[year] = response.records;
          } catch (error) {
            console.error(`Failed to load comparison weather for ${year}`, error);
            comparisonError = true;
          }
        }),
        ...missingBaselines.map(async (year) => {
          try {
            const startDate = setIsoYear(dataLoadRange.startDate, year);
            const endDate = setIsoYear(dataLoadRange.endDate, year);
            const response = await openMeteoProvider.getDailyWeather({
              cropId: field.cropId,
              lat: field.lat,
              lon: field.lon,
              startDate,
              endDate,
            });
            nextBaselines[year] = response.records;
          } catch (error) {
            console.error(`Failed to load baseline weather for ${year}`, error);
            baselineError = true;
          }
        }),
      ]);

      if (ignore) return;

      if (Object.keys(nextComparisons).length > 0) {
        setComparisonWeatherByYear((current) => ({ ...current, ...nextComparisons }));
      }
      if (Object.keys(nextBaselines).length > 0) {
        setBaselineWeatherByYear((current) => ({ ...current, ...nextBaselines }));
      }

      if (missingComparisons.length) {
        setLoadFlags((current) => ({ ...current, openMeteoComparisons: comparisonError ? "error" : "loaded" }));
      }
      if (missingBaselines.length) {
        setLoadFlags((current) => ({ ...current, openMeteoBaseline: baselineError ? "error" : "loaded" }));
      }
    }

    void fetchComparisonsAndBaselines();

    return () => {
      ignore = true;
    };
  }, [
    baselineWeatherByYear,
    comparisonWeatherByYear,
    dataLoadRange.endDate,
    dataLoadRange.startDate,
    field.cropId,
    field.lat,
    field.lon,
    selectedComparisonYears,
  ]);

  const analysisField = useMemo(() => ({ ...field, stageStartDate: dateRange.startDate }), [dateRange.startDate, field]);
  const snapshot = useMemo(() => buildAnalyticsSnapshot(analysisField, metricCrop, weatherRecords, []), [analysisField, metricCrop, weatherRecords]);
  const comparisonSnapshotsByYear = useMemo(() => {
    const entries = comparisonYears
      .map((year) => {
        const records = comparisonWeatherByYear[year] ?? [];
        if (!records.length) return null;
        const comparisonField = { ...field, stageStartDate: setIsoYear(dateRange.startDate, year) };
        return [year, buildAnalyticsSnapshot(comparisonField, metricCrop, records, [])] as const;
      })
      .filter((entry): entry is readonly [number, ReturnType<typeof buildAnalyticsSnapshot>] => entry !== null);

    return Object.fromEntries(entries);
  }, [comparisonWeatherByYear, comparisonYears, dateRange.startDate, field, metricCrop]);
  const baselineSnapshots = useMemo(
    () =>
      Object.entries(baselineWeatherByYear)
        .map(([year, records]) => {
          const baselineField = { ...field, stageStartDate: setIsoYear(dateRange.startDate, Number(year)) };
          return buildAnalyticsSnapshot(baselineField, metricCrop, records, []);
        })
        .filter((baselineSnapshot) => baselineSnapshot.records.length),
    [baselineWeatherByYear, dateRange.startDate, field, metricCrop],
  );
  const historicalWeatherRecords = weatherRecords.filter((record) => record.source === "historical");
  const forecastWeatherRecords = weatherRecords.filter((record) => record.source === "forecast");
  const historicalEtRecords = etRecords.filter((record) => record.source !== "forecast");
  const forecastPetRecords = etRecords.filter((record) => record.source === "forecast");
  const cumulativeActualEtMm = historicalEtRecords.reduce((total, record) => total + (record.etActualMm ?? 0), 0);
  const cumulativeReferenceEtMm = historicalEtRecords.reduce((total, record) => total + (record.etoMm ?? record.etReferenceMm ?? 0), 0);
  const cumulativeForecastPetMm = forecastPetRecords.reduce((total, record) => total + (record.etoMm ?? record.etReferenceMm ?? 0), 0);
  const irrigationWindow = useMemo(() => {
    const rawMm = field.awhcMmPerM * field.rootDepthM * field.madFraction;
    let depletionMm = 0;

    for (const record of snapshot.records) {
      const weather = weatherRecords.find((weatherRecord) => weatherRecord.date === record.date);
      depletionMm = Math.max(0, depletionMm + record.etcMm - (weather?.precipMm ?? 0));

      if (depletionMm >= rawMm) {
        return {
          date: record.date,
          days: clampDayDistance(dateRange.endDate, record.date),
          rawMm,
          depletionMm,
        };
      }
    }

    return {
      date: undefined,
      days: undefined,
      rawMm,
      depletionMm,
    };
  }, [dateRange.endDate, field.awhcMmPerM, field.madFraction, field.rootDepthM, snapshot.records, weatherRecords]);
  const chartData = useMemo(() => {
    let cumulativeActual = 0;
    let cumulativeReference = 0;
    let cumulativeForecast = 0;
    let cumulativeForecastP10 = 0;
    let cumulativeForecastP90 = 0;

    return etRecords.map((record) => {
      const actual = record.source === "forecast" ? 0 : record.etActualMm ?? 0;
      const reference = record.source === "forecast" ? 0 : record.etoMm ?? record.etReferenceMm ?? 0;
      const forecast = record.source === "forecast" ? record.etoMm ?? record.etReferenceMm ?? 0 : 0;
      const forecastP10 = record.source === "forecast" ? record.forecastPetP10Mm : undefined;
      const forecastP90 = record.source === "forecast" ? record.forecastPetP90Mm : undefined;

      cumulativeActual += actual;
      cumulativeReference += reference;
      cumulativeForecast += forecast;
      cumulativeForecastP10 += forecastP10 ?? 0;
      cumulativeForecastP90 += forecastP90 ?? 0;

      return {
        date: formatDateLabel(record.date),
        fullDate: record.date,
        actual: record.source === "forecast" ? undefined : Number(((etChartMode === "daily" ? actual : cumulativeActual) / 25.4).toFixed(2)),
        reference: record.source === "forecast" ? undefined : Number(((etChartMode === "daily" ? reference : cumulativeReference) / 25.4).toFixed(2)),
        forecast: record.source === "forecast" ? Number(((etChartMode === "daily" ? forecast : cumulativeForecast) / 25.4).toFixed(2)) : undefined,
        forecastP10: typeof forecastP10 === "number" ? Number(((etChartMode === "daily" ? forecastP10 : cumulativeForecastP10) / 25.4).toFixed(2)) : undefined,
        forecastP90: typeof forecastP90 === "number" ? Number(((etChartMode === "daily" ? forecastP90 : cumulativeForecastP90) / 25.4).toFixed(2)) : undefined,
      };
    });
  }, [etChartMode, etRecords]);
  const chillSeries = useMemo(
    () =>
      cumulativeChillHours(
        weatherRecords,
        cropMetrics.chill.thresholdMinC ?? 0,
        cropMetrics.chill.thresholdMaxC ?? 7.2,
      ),
    [cropMetrics.chill.thresholdMaxC, cropMetrics.chill.thresholdMinC, weatherRecords],
  );
  const cropMetricChartData = useMemo(() => {
    const records = cropMetricView === "gdd" ? snapshot.records : chillSeries;

    return records.map((record, index) => {
      const currentValue = "cumulativeGdd" in record ? record.cumulativeGdd : record.cumulativeChillHours;
      const normalValues =
        cropMetricView === "gdd"
          ? baselineSnapshots
              .map((baselineSnapshot) => baselineSnapshot.records[index]?.cumulativeGdd)
              .filter((value): value is number => typeof value === "number")
          : [];
      const normal = normalValues.length ? Number((normalValues.reduce((total, value) => total + value, 0) / normalValues.length).toFixed(1)) : undefined;
      const point: Record<string, string | number | undefined> = {
        date: formatDateLabel(record.date),
        fullDate: record.date,
        daily: "gdd" in record ? record.gdd : 0,
        current: currentValue,
        normal,
      };

      if (cropMetricView === "gdd") {
        comparisonYears.forEach((year) => {
          point[`year${year}`] = comparisonSnapshotsByYear[year]?.records[index]?.cumulativeGdd;
        });
      }

      return point;
    });
  }, [baselineSnapshots, chillSeries, comparisonSnapshotsByYear, comparisonYears, cropMetricView, snapshot.records]);
  const displayEndDate = toIsoDate(addUtcDays(new Date(`${dateRange.endDate}T00:00:00Z`), climateToolboxApi.enabled ? 28 : 0));
  const chartRenderData = cropMetricChartData.length
    ? cropMetricChartData
    : [
        {
          date: formatDateLabel(dateRange.startDate),
          fullDate: dateRange.startDate,
          daily: 0,
          current: 0,
          normal: undefined,
        },
        {
          date: formatDateLabel(displayEndDate),
          fullDate: displayEndDate,
          daily: 0,
          current: 0,
          normal: undefined,
        },
      ];
  const labelStep = Math.max(1, Math.ceil(chartRenderData.length / 8));
  const chartTicks = chartRenderData.filter((_, index) => index % labelStep === 0 || index === chartRenderData.length - 1).map((point) => String(point.date));
  const chartLabel = cropMetricView === "gdd" ? "Cumulative GDD (CDD)" : "Cumulative Chill Hours";
  const isEtChartLoading = etLoading;
  const seasonDayCount = Math.max(1, clampDayDistance(seasonStartDate, dateRange.endDate));
  const selectedStartDay = Math.min(seasonDayCount, clampDayDistance(seasonStartDate, dateRange.startDate));
  const latestObservedPoint = [...cropMetricChartData].reverse().find((point) => String(point.fullDate).localeCompare(dateRange.endDate) <= 0);
  const finalMetricPoint = cropMetricChartData.at(-1);
  const gddToDate = cropMetricView === "gdd" ? Number(latestObservedPoint?.current ?? 0) : 0;
  const normalToDate = cropMetricView === "gdd" ? Number(latestObservedPoint?.normal ?? 0) : 0;
  const gddVsNormal = Number((gddToDate - normalToDate).toFixed(1));
  const forecastGdd = cropMetricView === "gdd" ? Number((Number(finalMetricPoint?.current ?? 0) - gddToDate).toFixed(1)) : 0;
  const chillPercent =
    snapshot.chillPortions && snapshot.chillRequirement
      ? Math.min(100, Math.round((snapshot.chillPortions / snapshot.chillRequirement) * 100))
      : undefined;
  const currentChillHours = chillSeries.at(-1)?.cumulativeChillHours ?? 0;
  const nextStageDistance = snapshot.nextStage?.gdd !== null && typeof snapshot.nextStage?.gdd === "number" ? Math.max(0, Math.round(snapshot.nextStage.gdd - snapshot.currentGdd)) : undefined;

  function toggleComparisonYear(year: number) {
    setSelectedComparisonYears((current) => (current.includes(year) ? current.filter((item) => item !== year) : [...current, year]));
  }

  function handleAddComparisonYear() {
    const nextYear = Number(customComparisonYear);
    const currentYear = getIsoYear(dataLoadRange.endDate);

    if (!Number.isInteger(nextYear)) {
      setCustomComparisonYearError("Enter a whole year.");
      return;
    }

    if (nextYear < 1940 || nextYear >= currentYear) {
      setCustomComparisonYearError(`Use a year from 1940 to ${currentYear - 1}.`);
      return;
    }

    if (comparisonYears.includes(nextYear)) {
      setCustomComparisonYearError(`${nextYear} is already in the stack.`);
      return;
    }

    setComparisonYears((current) => getUniqueSortedYears([...current, nextYear]));
    setSelectedComparisonYears((current) => getUniqueSortedYears([...current, nextYear]));
    setCustomComparisonYear("");
    setCustomComparisonYearError(null);
  }

  function handleDeleteComparisonYear(year: number) {
    setComparisonYears((current) => current.filter((item) => item !== year));
    setSelectedComparisonYears((current) => current.filter((item) => item !== year));
    setComparisonWeatherByYear((current) => {
      const { [year]: _deletedYear, ...rest } = current;
      return rest;
    });
  }

  function handleStartDayChange(value: string) {
    const nextDay = Number(value);
    if (!Number.isFinite(nextDay)) return;
    setSelectedStartDate(toIsoDate(addUtcDays(new Date(`${seasonStartDate}T00:00:00Z`), nextDay)));
  }

  function handleStartDateChange(value: string) {
    if (!value) return;
    if (value < seasonStartDate) {
      setSelectedStartDate(seasonStartDate);
      return;
    }
    if (value > dateRange.endDate) {
      setSelectedStartDate(dateRange.endDate);
      return;
    }
    setSelectedStartDate(value);
  }

  function handleCustomGddTargetChange(value: string) {
    const nextTarget = Number(value);
    if (!Number.isFinite(nextTarget)) return;
    setCustomGddTarget(Math.max(0, Math.round(nextTarget)));
  }

  const stageReferenceGroups = [...metricStages.reduce((groups, stage) => {
    if (typeof stage.gdd !== "number") return groups;
    const gdd = stage.gdd;
    const existing = groups.get(gdd);
    if (existing) {
      existing.labels.push(stage.label);
    } else {
      groups.set(gdd, { gdd, labels: [stage.label] });
    }
    return groups;
  }, new Map<number, { gdd: number; labels: string[] }>()).values()].sort((left, right) => left.gdd - right.gdd);
  const cumulativeMetricValues = cropMetricChartData.flatMap((point) =>
    Object.entries(point)
      .filter(([key]) => key === "current" || key === "normal" || (key.startsWith("year") && selectedComparisonYears.includes(Number(key.slice(4)))))
      .map(([, value]) => (typeof value === "number" ? value : 0)),
  );
  const metricReferenceValues =
    cropMetricView === "gdd"
      ? [...stageReferenceGroups.map((stage) => stage.gdd), customGddTarget]
      : cropMetrics.chill.requirement
        ? [cropMetrics.chill.requirement]
        : [];
  const metricYAxisMax = Math.max(1, Math.ceil(Math.max(...cumulativeMetricValues, ...metricReferenceValues, 0) * 1.08));

  function handleOpenEtLoadEvent(event: OpenEtLoadEvent) {
    debugDataSource("openet", event.stage, {
      fieldId: field.id,
      variable: event.variable,
    });

    setLoadFlags((current) => {
      if (event.stage === "cache-check-start") return { ...current, pocketBaseEtData: "checking" };
      if (event.stage === "cache-hit") return { ...current, pocketBaseEtData: "hit", openEtApi: current.openEtApi === "idle" ? "loaded" : current.openEtApi };
      if (event.stage === "cache-miss") return { ...current, pocketBaseEtData: "miss" };
      if (event.stage === "openet-fetch-start") return { ...current, openEtApi: "fetching" };
      if (event.stage === "openet-fetch-success") return { ...current, openEtApi: "loaded" };
      if (event.stage === "cache-save-start") return { ...current, pocketBaseEtSave: "saving" };
      if (event.stage === "cache-save-complete") return { ...current, pocketBaseEtSave: "loaded" };
      return current;
    });
  }

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <div className="heading-row">
            <h1>Real-Time Insights</h1>
            <span className="season-badge">
              {formatDateLabel(dateRange.startDate)} - {formatDateLabel(displayEndDate)}
            </span>
            <span className="data-source-badge">{dataSourceLabel}</span>
          </div>
          <p>
            {field.name} - {field.cropLabel}
          </p>
          {dataWarning ? <p className="data-warning">{dataWarning}</p> : null}
        </div>
        <div className="toolbar">
          <button>
            <CalendarDays size={18} />
            Start Date + Forecast
          </button>
          <button className="primary-button">
            <Download size={18} />
            Export Data
          </button>
        </div>
      </div>

      <section className="metrics-grid">
        <MetricCard
          label="Cumulative GDD"
          value={weatherRecords.length ? Math.round(snapshot.currentGdd).toLocaleString() : "Pending"}
          detail={
            weatherRecords.length
              ? `${historicalWeatherRecords.length} historical + ${forecastWeatherRecords.length} forecast weather days`
              : "Historical weather provider needed"
          }
          badge={cropMetrics.gdd.confidence === "mock" ? "Needs source" : cropMetrics.gdd.confidence}
          icon={ThermometerSun}
          tone="success"
          info={`GDD uses ${metricCrop.tBaseC}C base and ${metricCrop.tUpperC}C upper thresholds from this field configuration. Crop defaults are editable in field setup.`}
        />
        <MetricCard
          label="Current Stage"
          value={snapshot.currentStage.label}
          detail={snapshot.nextStage ? `${nextStageDistance} CDD to ${snapshot.nextStage.label}` : "Final configured stage reached"}
          badge={cropMetrics.gdd.biofixLabel}
          icon={CalendarDays}
          tone="success"
          info="Current stage is selected from cumulative GDD and the crop metric stage thresholds. Field-level stage overrides still take precedence when configured."
        />
        <MetricCard
          label="Forecast Window"
          value={forecastWeatherRecords.length ? `${forecastWeatherRecords.length} days` : "Pending"}
          detail={forecastWeatherRecords.length ? "Projected forward from Climate Toolbox weather" : "Forecast weather loading"}
          badge="Projection"
          icon={ThermometerSun}
          tone="success"
          info="Forecast GDD is appended from Climate Toolbox Tmin/Tmax. This keeps the graph focused on crop-stage timing rather than irrigation scheduling."
        />
        {snapshot.chillRequirement ? (
          <MetricCard
            label="Chill Hours"
            value={weatherRecords.length ? currentChillHours.toLocaleString() : "Pending"}
            detail={cropMetrics.chill.requirement ? `${Math.round((currentChillHours / cropMetrics.chill.requirement) * 100)}% of configured ${cropMetrics.chill.requirement} hour requirement` : "No chill target configured"}
            badge={cropMetrics.chill.confidence === "mock" ? "Needs source" : cropMetrics.chill.confidence}
            icon={Snowflake}
            tone="success"
            info="Chill hours count hourly temperatures between the configured chill temperature bounds. Perennial requirements should be replaced with source-backed crop and variety values in cropMetrics.ts."
          />
        ) : (
          <MetricCard
            label="Chill View"
            value="Off"
            detail="Annual crop profile does not require chill tracking."
            icon={Snowflake}
            info="Chill tracking is only enabled for perennial crop metric profiles."
          />
        )}
        <MetricCard
          label="Data Source"
          value={historicalWeatherRecords.length ? "Live" : "Pending"}
          detail="Open-Meteo current, comparison, baseline weather + Climate Toolbox forecast"
          badge={formatLoadFlag(loadFlags.openMeteoWeather)}
          icon={Download}
          info="GDD and chill are calculated client-side from weather records. We are not caching GDD calculations unless performance requires it."
        />
      </section>

      <section className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-title-row">
            <div>
              <h2>Crop Metrics Tracker</h2>
              <p>
                {cropMetrics.displayName} {cropMetricView === "gdd" ? "cumulative GDD with historical comparison years and baseline normal" : "cumulative chill hours"}
              </p>
            </div>
            <div className="segmented">
              <button className={cropMetricView === "gdd" ? "selected" : ""} type="button" onClick={() => setCropMetricView("gdd")}>
                GDD
              </button>
              <button className={cropMetricView === "chill" ? "selected" : ""} type="button" onClick={() => setCropMetricView("chill")} disabled={!cropMetrics.chill.enabled}>
                Chill
              </button>
            </div>
          </div>
          {cropMetricView === "gdd" ? (
            <>
              <div className="gdd-control-row">
                <label>
                  <span>Start Date</span>
                  <input type="date" value={dateRange.startDate} min={seasonStartDate} max={dateRange.endDate} onChange={(event) => handleStartDateChange(event.target.value)} />
                </label>
                <label className="gdd-slider-control">
                  <span>Plant / Biofix Day</span>
                  <input type="range" value={selectedStartDay} min={0} max={seasonDayCount} onChange={(event) => handleStartDayChange(event.target.value)} />
                </label>
                <label>
                  <span>Custom GDU Target</span>
                  <input type="number" value={customGddTarget} min={0} step={25} onChange={(event) => handleCustomGddTargetChange(event.target.value)} />
                </label>
              </div>
              <div className="gdd-summary-row" aria-label="GDD summary metrics">
                <div>
                  <span>To Date</span>
                  <strong>{Math.round(gddToDate).toLocaleString()}</strong>
                </div>
                <div>
                  <span>Normal</span>
                  <strong>{Math.round(normalToDate).toLocaleString()}</strong>
                </div>
                <div>
                  <span>Versus Normal</span>
                  <strong>{gddVsNormal >= 0 ? "+" : ""}{Math.round(gddVsNormal).toLocaleString()}</strong>
                </div>
                <div>
                  <span>Forecast (+28 Days)</span>
                  <strong>{Math.round(forecastGdd).toLocaleString()}</strong>
                </div>
              </div>
            </>
          ) : null}
          <div className="year-toggle-row" aria-label="Comparison years">
            <div className="comparison-year-add">
              <label>
                <span>Add Year</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1940}
                  max={getIsoYear(dataLoadRange.endDate) - 1}
                  placeholder={`${getIsoYear(dataLoadRange.endDate) - 1}`}
                  value={customComparisonYear}
                  onChange={(event) => {
                    setCustomComparisonYear(event.target.value);
                    setCustomComparisonYearError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddComparisonYear();
                    }
                  }}
                />
              </label>
              <button type="button" className="icon-button" aria-label="Add comparison year" title="Add comparison year" onClick={handleAddComparisonYear}>
                <Plus size={16} />
              </button>
            </div>
            {comparisonYears.map((year) => (
              <div key={year} className="year-toggle">
                <label>
                  <input type="checkbox" checked={selectedComparisonYears.includes(year)} onChange={() => toggleComparisonYear(year)} />
                  <span>{year}</span>
                </label>
                <button type="button" aria-label={`Delete ${year} from comparison stack`} title={`Delete ${year}`} onClick={() => handleDeleteComparisonYear(year)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {customComparisonYearError ? <p className="comparison-year-error">{customComparisonYearError}</p> : null}
          <div className="chart-wrap">
            {chartRenderData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRenderData} margin={{ top: 28, right: 178, bottom: 16, left: 12 }}>
                  <CartesianGrid stroke="#d8ddd6" strokeDasharray="2 8" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} ticks={chartTicks} minTickGap={0} tick={{ fontSize: 11 }} height={42} />
                  <YAxis
                    yAxisId="cumulative"
                    tickLine={false}
                    axisLine={false}
                    width={58}
                    domain={[0, metricYAxisMax]}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                    label={{
                      value: chartLabel,
                      angle: -90,
                      position: "insideLeft",
                      offset: 2,
                      dy: 68,
                      fill: "#687078",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  />
                  <YAxis yAxisId="daily" orientation="right" hide domain={[0, 80]} />
                  <Tooltip
                    cursor={{
                      fill: "rgba(74, 124, 89, 0.18)",
                      stroke: "#2f6f3a",
                      strokeWidth: 1.5,
                    }}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #9fa89d",
                      borderRadius: 3,
                      boxShadow: "0 12px 28px rgba(6, 24, 39, 0.18)",
                      color: "#061827",
                      fontWeight: 800,
                    }}
                    labelStyle={{
                      color: "#061827",
                      fontWeight: 900,
                    }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        daily: "Daily GDD",
                        current: cropMetricView === "gdd" ? "Current GDD" : "Current Chill",
                        normal: "Historical Normal",
                      };
                      comparisonYears.forEach((year) => {
                        labels[`year${year}`] = `${year}`;
                      });
                      return [`${Number(value).toFixed(1)}`, labels[String(name)] ?? String(name)];
                    }}
                    labelFormatter={(label) => chartRenderData.find((point) => point.date === label)?.fullDate ?? label}
                  />
                  {cropMetricView === "gdd" ? <Bar yAxisId="daily" dataKey="daily" fill="#d1e9cb" fillOpacity={0.72} maxBarSize={12} radius={[2, 2, 0, 0]} /> : null}
                  {cropMetricView === "gdd" ? <Line yAxisId="cumulative" type="monotone" dataKey="normal" stroke="#934936" strokeDasharray="6 5" dot={false} strokeWidth={2} /> : null}
                  {cropMetricView === "gdd"
                    ? stageReferenceGroups.map((stage) => (
                        <ReferenceLine
                          key={stage.gdd}
                          yAxisId="cumulative"
                          y={stage.gdd}
                          stroke="#4a7c59"
                          strokeDasharray="3 5"
                          strokeOpacity={0.72}
                          label={(props) => <StageReferenceLabel {...props} value={stage.labels.join(" / ")} dy={stage.gdd === 0 ? -14 : -8} />}
                        />
                      ))
                    : null}
                  {cropMetricView === "gdd"
                    ? selectedComparisonYears.map((year, index) => (
                        <Line
                          key={year}
                          yAxisId="cumulative"
                          type="monotone"
                          dataKey={`year${year}`}
                          stroke={["#a87945", "#7d8b52", "#b26046"][index % 3]}
                          dot={false}
                          strokeWidth={1.8}
                          strokeOpacity={0.72}
                        />
                      ))
                    : null}
                  <Line yAxisId="cumulative" type="monotone" dataKey="current" stroke="#061827" dot={false} strokeWidth={3} />
                  {cropMetricView === "gdd"
                    ? (
                        <ReferenceLine
                          yAxisId="cumulative"
                          y={customGddTarget}
                          stroke="#934936"
                          strokeDasharray="8 4"
                          strokeOpacity={0.82}
                          label={(props) => <StageReferenceLabel {...props} value="Custom Target" dy={-8} />}
                        />
                      )
                    : cropMetrics.chill.requirement
                      ? (
                          <ReferenceLine
                            yAxisId="cumulative"
                            y={cropMetrics.chill.requirement}
                            stroke="#4a7c59"
                            strokeDasharray="3 5"
                            strokeOpacity={0.75}
                            label={(props) => <StageReferenceLabel {...props} value="Chill target" dy={-8} />}
                          />
                        )
                      : null}
                </ComposedChart>
              </ResponsiveContainer>
            ) : null}
            {isEtChartLoading ? (
              <div className="chart-loading" role="status" aria-live="polite">
                <LoaderCircle size={34} />
                <span>Loading crop metrics</span>
              </div>
            ) : null}
            {!etLoading && !cropMetricChartData.length ? <div className="chart-empty">No weather records loaded for this field and date range.</div> : null}
          </div>
          <div className="legend">
            <span className="legend-etc">Current Season</span>
            {cropMetricView === "gdd" ? <span className="legend-daily">Daily GDD</span> : null}
            {cropMetricView === "gdd" ? <span className="legend-eto">Historical Normal</span> : null}
            {cropMetricView === "gdd" ? <span className="legend-forecast">Selected Years</span> : null}
            <span className="legend-forecast-range">Stage / Target</span>
          </div>
        </section>

      </section>
    </main>
  );
}
