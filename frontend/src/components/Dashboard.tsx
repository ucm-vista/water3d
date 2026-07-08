import { CalendarClock, Download, Droplets, Gauge, Info, Sprout, ThermometerSun } from "lucide-react";
import { Area, Bar, Customized, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsRestoring } from "@tanstack/react-query";
import { climateToolboxApi } from "../api/climate";
import { gridMetApi } from "../api/gridMet";
import {
  seasonWeatherEnabled,
  useAnalyticsSnapshot,
  useChillSeries,
  useChillWeather,
  useSeasonWeather,
  useStageProjections,
  useYearWeather,
} from "../api/queries";
import { buildAnalyticsSnapshot } from "../calcs/analytics";
import { cumulativeChillHours, getChillSeasonStart } from "../calcs/chillHours";
import { averageDailyGddByMonthDay, daysAheadOfNormal, findThresholdDate } from "../calcs/stageProjection";
import { cropProfiles } from "../data/crops";
import { getCropMetricProfile } from "../data/cropMetrics";
import type { FieldConfig, WeatherRecord } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { addUtcDays, getCurrentYearStartDate, getRollingDateRange, toIsoDate } from "../utils/dateRange";
import { downloadCsv } from "../utils/exportCsv";
import {
  celsiusToDisplayTemp,
  etUnitFactor,
  etUnitLabel,
  gddUnitFactor,
  gddUnitLabel,
  loadUnitSystem,
  saveUnitSystem,
  tempUnitSuffix,
} from "../utils/units";
import { MetricCard } from "./MetricCard";
import { AdvancedGraphSettings } from "./AdvancedGraphSettings";
import { InlineMetricControls, type MetricView } from "./InlineMetricControls";
import { TomatoLoader } from "./TomatoLoader";
import { buildDefaultGraphSettings, FORECAST_RANGE_OPTIONS, type GraphSettings } from "./graphSettings";

// The forecast fetch always pulls the widest selectable window; the UI then
// clamps what it *shows* to the range the user picked. Keep these in sync so a
// "+28 days" selection never asks for more data than we requested.
const MAX_FORECAST_DAYS = Math.max(...FORECAST_RANGE_OPTIONS);
import { useEffect, useMemo, useState } from "react";

interface DashboardProps {
  field: FieldConfig;
  onEditStages?: () => void;
}

const COMPARISON_YEAR_COLORS = ["#a87945", "#7d8b52", "#b26046"];

function comparisonYearColor(index: number): string {
  return COMPARISON_YEAR_COLORS[index % COMPARISON_YEAR_COLORS.length];
}

// Reference-ETo year-over-year overlays use a cooler (blue) palette so they read
// as the "reference ETo" family yet stay distinct from the rust current-season
// reference ETo line and the crop-ET / daily-bar colors.
const ETO_COMPARISON_YEAR_COLORS = ["#5f8fc0", "#4f8a8b", "#8a86c9"];
const ETO_NORMAL_COLOR = "#3f6486";

function etoComparisonYearColor(index: number): string {
  return ETO_COMPARISON_YEAR_COLORS[index % ETO_COMPARISON_YEAR_COLORS.length];
}

interface OverlayLabelItem {
  value: number;
  text: string;
  detail: string;
  color: string;
}

// Renders stage/target labels in the chart's right margin with collision
// avoidance (vertical stagger), small backgrounds, and clamping so labels stay
// inside the chart bounds. Receives Recharts' internal layout via Customized.
function StageLabelsOverlay(props: {
  items?: OverlayLabelItem[];
  width?: number;
  yAxisMap?: Record<string, { scale: (value: number) => number }>;
  offset?: { top: number; left: number; width: number; height: number };
}) {
  const { items, yAxisMap, offset } = props;
  const axis = yAxisMap?.cumulative;
  if (!axis || typeof axis.scale !== "function" || !offset || typeof offset.top !== "number" || !items?.length) return null;

  const minGap = 17;
  const top = offset.top + 7;
  const bottom = offset.top + offset.height - 5;
  const plotRight = offset.left + offset.width;
  const chartWidth = typeof props.width === "number" ? props.width : plotRight + 178;
  const rightEdge = chartWidth - 6;
  const maxLabelWidth = Math.max(40, rightEdge - plotRight - 4);

  const laid = items
    .map((item) => ({ ...item, lineY: axis.scale(item.value), y: axis.scale(item.value) }))
    .filter((item) => Number.isFinite(item.y))
    .sort((a, b) => a.lineY - b.lineY);

  let previous = -Infinity;
  for (const item of laid) {
    let y = Math.max(top, Math.min(bottom, item.y));
    if (y < previous + minGap) y = previous + minGap;
    item.y = y;
    previous = y;
  }

  return (
    <g className="stage-label-overlay">
      {laid.map((item, index) => {
        const estWidth = Math.min(maxLabelWidth, 18 + item.text.length * 7 + item.detail.length * 6);
        const rectLeft = rightEdge - estWidth;
        return (
          <g key={`${item.text}-${index}`}>
            <line
              x1={plotRight}
              x2={Math.max(plotRight, rectLeft - 3)}
              y1={item.lineY}
              y2={item.y}
              stroke={item.color}
              strokeOpacity={0.4}
              strokeWidth={1}
            />
            <rect x={rectLeft} y={item.y - 11} width={estWidth} height={20} rx={3} fill="#ffffff" fillOpacity={0.88} />
            <text x={rightEdge} y={item.y + 3} textAnchor="end" fontSize={11} fontWeight={800} fill={item.color}>
              {item.text}
              <tspan dx={6} fontSize={10} fontWeight={600} fillOpacity={0.7}>
                {item.detail}
              </tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface ReferenceLabelProps {
  value?: string;
  detail?: string;
  viewBox?: { x?: number; y?: number; width?: number };
  dy?: number;
  dx?: number;
  fill?: string;
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

function StageReferenceLabel({ value = "", detail, viewBox, dy = -8, dx = 0, fill = "#2f6f3a" }: ReferenceLabelProps) {
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
      {detail ? (
        <tspan dx={6} fontSize={10} fontWeight={700} fillOpacity={0.75}>
          {detail}
        </tspan>
      ) : null}
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

function getIsoYear(date: string): number {
  return Number(date.slice(0, 4));
}

function setIsoYear(date: string, year: number): string {
  return `${year}${date.slice(4)}`;
}

function getBaselineYears(currentYear: number, count = 5): number[] {
  return Array.from({ length: count }, (_, index) => currentYear - count + index);
}

const EMPTY_RECORDS: WeatherRecord[] = [];

// Narrow a year->weather map to a specific set of years (e.g. the comparison
// selection or the 5-yr-normal window) drawn from the shared per-year cache.
function pickYears(byYear: Record<number, WeatherRecord[]>, years: number[]): Record<number, WeatherRecord[]> {
  const selected: Record<number, WeatherRecord[]> = {};
  for (const year of years) {
    if (byYear[year]) selected[year] = byYear[year];
  }
  return selected;
}

export function Dashboard({ field, onEditStages }: DashboardProps) {
  const todayIso = useMemo(() => getRollingDateRange(1).endDate, []);
  const seasonStartDate = useMemo(() => getCurrentYearStartDate(), []);
  const defaultStartDate = useMemo(() => field.stageStartDate || getCurrentYearStartDate(), [field.stageStartDate]);
  const currentYear = getIsoYear(seasonStartDate);
  const yearEndDate = `${currentYear}-12-31`;
  const crop = cropProfiles[field.cropId];
  const cropMetrics = getCropMetricProfile(field.cropId);
  // For the "other" crop the user supplies the name, so prefer the field's
  // custom label over the generic metric-profile display name.
  const cropDisplayName = field.cropId === "other" ? field.cropLabel.trim() || cropMetrics.displayName : cropMetrics.displayName;
  const metricStages = field.stageThresholds?.length ? field.stageThresholds : cropMetrics.gdd.stages;

  // Default overlays: most-recent prior year + 5-yr average only. Additional
  // comparison years remain available via Advanced settings.
  const mostRecentComparisonYear = useMemo(
    () => (cropMetrics.comparisonYears.length ? Math.max(...cropMetrics.comparisonYears) : currentYear - 1),
    [cropMetrics.comparisonYears, currentYear],
  );

  const defaultSettings = useMemo(
    () =>
      buildDefaultGraphSettings({
        startDate: defaultStartDate,
        endDate: todayIso,
        forecastDays: climateToolboxApi.enabled ? 28 : 0,
        comparisonYears: cropMetrics.comparisonYears,
        selectedComparisonYears: [mostRecentComparisonYear],
        gddBaseTempC: field.gddBaseTempC ?? cropMetrics.gdd.baseTempC,
        gddUpperTempC: field.gddUpperTempC ?? cropMetrics.gdd.upperTempC,
        chillThresholdMinC: cropMetrics.chill.thresholdMinC ?? 0,
        chillThresholdMaxC: cropMetrics.chill.thresholdMaxC ?? 7.2,
        unitSystem: loadUnitSystem(),
      }),
    [cropMetrics, defaultStartDate, field.gddBaseTempC, field.gddUpperTempC, mostRecentComparisonYear, todayIso],
  );

  // Single live settings object — every control writes through and the chart
  // updates immediately (no draft/apply gate).
  const [settings, setSettings] = useState<GraphSettings>(defaultSettings);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [view, setView] = useState<MetricView>("gdd");

  const selectedStartDate = settings.startDate;
  const forecastDays = settings.forecastDays;
  const unitSystem = settings.unitSystem;
  const unitFactor = gddUnitFactor(unitSystem);
  const unitLabel = gddUnitLabel(unitSystem);
  const etFactor = etUnitFactor(settings.etUnit);
  const etLabel = etUnitLabel(settings.etUnit);
  const comparisonYears = settings.comparisonYears;
  const selectedComparisonYears = settings.selectedComparisonYears;
  const show = settings.show;

  // Last calendar day of the selected forecast window. The fetch always loads
  // MAX_FORECAST_DAYS of forecast; everything downstream (chart line, ET rows,
  // forecast metrics) clamps to this date so "+7 / +14 / +28" actually differ.
  // forecastDays === 0 ("No forecast") collapses the horizon to today.
  const forecastHorizonDate = toIsoDate(addUtcDays(new Date(`${todayIso}T00:00:00Z`), forecastDays));
  // The widest forecast window we ever fetch (the chart clamps what it shows),
  // so the season query key stays stable regardless of the selected range.
  const forecastEndDate = toIsoDate(addUtcDays(new Date(`${todayIso}T00:00:00Z`), MAX_FORECAST_DAYS));
  // Whether the forecast extension is drawn on the charts: needs both the
  // visibility toggle and a non-zero range.
  const forecastVisible = show.forecast && forecastDays > 0;

  const metricCrop = useMemo(
    () => ({
      ...crop,
      tBaseC: settings.gddBaseTempC,
      tUpperC: settings.gddUpperTempC,
      stages: metricStages,
    }),
    [crop, settings.gddBaseTempC, settings.gddUpperTempC, metricStages],
  );

  const chillSeasonStart = useMemo(
    () => (cropMetrics.chill.enabled ? getChillSeasonStart(cropMetrics.chill.defaultStartRule, todayIso) : undefined),
    [cropMetrics.chill.defaultStartRule, cropMetrics.chill.enabled, todayIso],
  );

  // ---- Field-scoped data cache (TanStack Query) ----
  // Every fetch + derivation below is cached and persisted to localStorage,
  // keyed so revisiting this field (or reloading) serves data instantly within
  // its TTL instead of refetching. See src/api/queries/.
  const isRestoring = useIsRestoring();
  const seasonQuery = useSeasonWeather({
    cropId: field.cropId,
    lat: field.lat,
    lon: field.lon,
    fieldId: field.id,
    seasonStartDate,
    todayIso,
    forecastEndDate,
  });
  const weatherRecords = seasonQuery.data?.records ?? EMPTY_RECORDS;

  const chillQuery = useChillWeather({
    cropId: field.cropId,
    lat: field.lat,
    lon: field.lon,
    fieldId: field.id,
    chillSeasonStart,
    todayIso,
  });
  const chillWeatherRecords = chillQuery.data ?? EMPTY_RECORDS;

  // Comparison + 5-yr-normal overlays share one per-year cache; toggling which
  // years are shown never refetches a year already loaded this session.
  const baselineYears = useMemo(() => getBaselineYears(currentYear), [currentYear]);
  const overlayYears = useMemo(
    () => [...new Set([...selectedComparisonYears, ...baselineYears])],
    [selectedComparisonYears, baselineYears],
  );
  const yearWeather = useYearWeather({
    cropId: field.cropId,
    lat: field.lat,
    lon: field.lon,
    years: overlayYears,
    currentYear,
  });
  const comparisonWeatherByYear = useMemo(
    () => pickYears(yearWeather.byYear, selectedComparisonYears),
    [yearWeather.byYear, selectedComparisonYears],
  );
  const baselineWeatherByYear = useMemo(
    () => pickYears(yearWeather.byYear, baselineYears),
    [yearWeather.byYear, baselineYears],
  );

  // Strict TTL: show the loader while the persisted cache is still restoring,
  // while there is no usable data, or while a stale (expired) entry is being
  // revalidated — never render stale data.
  const weatherLoading =
    seasonWeatherEnabled && (isRestoring || seasonQuery.isLoading || (seasonQuery.isFetching && seasonQuery.isStale));
  const overlaysLoading = gridMetApi.enabled && yearWeather.isFetching;
  const dataWarning = useMemo<string | null>(() => {
    if (!seasonWeatherEnabled) return "gridMET and Climate Toolbox are disabled. No weather data will be displayed.";
    if (seasonQuery.isError) return seasonQuery.error instanceof Error ? seasonQuery.error.message : "Weather data could not be loaded.";
    const warnings = seasonQuery.data?.warnings ?? [];
    return warnings.length ? warnings.join(" ") : null;
  }, [seasonQuery.data, seasonQuery.isError, seasonQuery.error]);

  // Reset live settings to this field/crop's defaults when the field changes.
  useEffect(() => {
    setSettings(defaultSettings);
    setAdvancedOpen(false);
    setView("gdd");
  }, [defaultSettings]);

  useEffect(() => {
    saveUnitSystem(settings.unitSystem);
  }, [settings.unitSystem]);

  function resetSettings() {
    setSettings(defaultSettings);
  }

  const analysisField = useMemo(() => ({ ...field, stageStartDate: selectedStartDate }), [field, selectedStartDate]);
  const snapshot = useAnalyticsSnapshot(analysisField, metricCrop, weatherRecords);
  const comparisonSnapshotsByYear = useMemo(() => {
    const entries = Object.entries(comparisonWeatherByYear)
      .map(([yearKey, records]) => {
        const year = Number(yearKey);
        if (!records.length) return null;
        const comparisonField = { ...field, stageStartDate: setIsoYear(selectedStartDate, year) };
        return [year, buildAnalyticsSnapshot(comparisonField, metricCrop, records, [])] as const;
      })
      .filter((entry): entry is readonly [number, ReturnType<typeof buildAnalyticsSnapshot>] => entry !== null);
    return Object.fromEntries(entries);
  }, [comparisonWeatherByYear, field, metricCrop, selectedStartDate]);
  const baselineSnapshots = useMemo(
    () =>
      Object.entries(baselineWeatherByYear)
        .map(([year, records]) => {
          const baselineField = { ...field, stageStartDate: setIsoYear(selectedStartDate, Number(year)) };
          return buildAnalyticsSnapshot(baselineField, metricCrop, records, []);
        })
        .filter((baselineSnapshot) => baselineSnapshot.records.length),
    [baselineWeatherByYear, field, metricCrop, selectedStartDate],
  );

  // Overlay curves aligned to the current season by calendar day (MM-DD).
  const normalCumulativeByMonthDay = useMemo(() => {
    const buckets = new Map<string, { sum: number; count: number }>();
    for (const baselineSnapshot of baselineSnapshots) {
      for (const record of baselineSnapshot.records) {
        const key = record.date.slice(5);
        const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
        bucket.sum += record.cumulativeGdd;
        bucket.count += 1;
        buckets.set(key, bucket);
      }
    }
    return new Map([...buckets.entries()].map(([key, bucket]) => [key, Number((bucket.sum / bucket.count).toFixed(1))]));
  }, [baselineSnapshots]);
  const comparisonByMonthDay = useMemo(() => {
    const maps: Record<number, Map<string, number>> = {};
    for (const [yearKey, comparisonSnapshot] of Object.entries(comparisonSnapshotsByYear)) {
      maps[Number(yearKey)] = new Map(comparisonSnapshot.records.map((record) => [record.date.slice(5), record.cumulativeGdd]));
    }
    return maps;
  }, [comparisonSnapshotsByYear]);
  const normalDailyGddByMonthDay = useMemo(
    () => averageDailyGddByMonthDay(baselineWeatherByYear, metricCrop),
    [baselineWeatherByYear, metricCrop],
  );

  // Reference-ETo (atmospheric demand) year-over-year overlays for the ET view,
  // aligned by calendar day (MM-DD) like the GDD overlays. Deliberately built
  // from cumulative *reference* ETo rather than crop ETc: ETc rides the Kc/stage
  // curve, whose timing shifts year to year, so ETo isolates the weather-year
  // difference that a "was this a thirstier season" comparison actually wants.
  const etoNormalCumulativeByMonthDay = useMemo(() => {
    const buckets = new Map<string, { sum: number; count: number }>();
    for (const baselineSnapshot of baselineSnapshots) {
      for (const record of baselineSnapshot.records) {
        const key = record.date.slice(5);
        const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
        bucket.sum += record.cumulativeEtoMm;
        bucket.count += 1;
        buckets.set(key, bucket);
      }
    }
    return new Map([...buckets.entries()].map(([key, bucket]) => [key, Number((bucket.sum / bucket.count).toFixed(2))]));
  }, [baselineSnapshots]);
  const etoComparisonByMonthDay = useMemo(() => {
    const maps: Record<number, Map<string, number>> = {};
    for (const [yearKey, comparisonSnapshot] of Object.entries(comparisonSnapshotsByYear)) {
      maps[Number(yearKey)] = new Map(comparisonSnapshot.records.map((record) => [record.date.slice(5), record.cumulativeEtoMm]));
    }
    return maps;
  }, [comparisonSnapshotsByYear]);
  const normalSeriesFromStart = useMemo(() => {
    if (!normalCumulativeByMonthDay.size) return [] as Array<number | undefined>;
    const seasonEnd = `${getIsoYear(selectedStartDate)}-12-31`;
    const length = clampDayDistance(selectedStartDate, seasonEnd) + 1;
    const start = new Date(`${selectedStartDate}T00:00:00Z`);
    return Array.from({ length }, (_, index) => normalCumulativeByMonthDay.get(toIsoDate(addUtcDays(start, index)).slice(5)));
  }, [normalCumulativeByMonthDay, selectedStartDate]);

  const historicalWeatherRecords = weatherRecords.filter((record) => record.source === "historical");
  const forecastWeatherRecords = weatherRecords.filter((record) => record.source === "forecast");
  const observedRecords = snapshot.records.filter((record) => record.date <= todayIso);
  const gddToDateC = observedRecords.at(-1)?.cumulativeGdd ?? 0;
  const todayIndexFromStart = clampDayDistance(selectedStartDate, todayIso);
  const normalToDateC = normalCumulativeByMonthDay.get(todayIso.slice(5));
  const gddVsNormalC = typeof normalToDateC === "number" ? gddToDateC - normalToDateC : undefined;
  const daysVsNormal =
    typeof normalToDateC === "number" && observedRecords.length
      ? daysAheadOfNormal(gddToDateC, normalSeriesFromStart, todayIndexFromStart)
      : undefined;
  const forecastEndRecord = snapshot.records.filter((record) => record.date <= forecastHorizonDate).at(-1);
  const forecastGddC = (forecastEndRecord?.cumulativeGdd ?? gddToDateC) - gddToDateC;

  const numericStages = metricStages.filter((stage): stage is typeof stage & { gdd: number } => typeof stage.gdd === "number");
  const currentStage = numericStages.reduce((active, stage) => (gddToDateC >= stage.gdd ? stage : active), numericStages[0] ?? metricStages[0]);
  const nextStage = numericStages.find((stage) => stage.gdd > gddToDateC);

  const stageProjections = useStageProjections(metricStages, snapshot.records, todayIso, normalDailyGddByMonthDay);
  const nextStageProjection = nextStage ? stageProjections.find((projection) => projection.label === nextStage.label) : undefined;
  const priorYearForTimeline = useMemo(() => {
    const years = Object.keys(comparisonSnapshotsByYear).map(Number);
    return years.length ? Math.max(...years) : undefined;
  }, [comparisonSnapshotsByYear]);
  const priorYearStageDates = useMemo(() => {
    if (!priorYearForTimeline) return {} as Record<string, string | undefined>;
    const records = comparisonSnapshotsByYear[priorYearForTimeline]?.records ?? [];
    return Object.fromEntries(stageProjections.map((projection) => [projection.label, findThresholdDate(records, projection.thresholdGdd)]));
  }, [comparisonSnapshotsByYear, priorYearForTimeline, stageProjections]);

  const chillSeries = useChillSeries(chillWeatherRecords, settings.chillThresholdMinC, settings.chillThresholdMaxC);
  const currentChillHours = chillSeries.at(-1)?.cumulativeChillHours ?? 0;
  const chillRequirement = cropMetrics.chill.requirement;
  const chillPercent = chillRequirement ? Math.round((currentChillHours / chillRequirement) * 100) : undefined;

  // ---- Full calendar-year GDD chart (Jan 1 -> Dec 31) ----
  // Current season = observed history + forecast; beyond that a dashed
  // projection extends to year-end using the 5-yr-average daily curve.
  const fullYearDates = useMemo(() => {
    const dates: string[] = [];
    let cursor = new Date(`${currentYear}-01-01T00:00:00Z`);
    const end = new Date(`${yearEndDate}T00:00:00Z`);
    while (cursor <= end) {
      dates.push(toIsoDate(cursor));
      cursor = addUtcDays(cursor, 1);
    }
    return dates;
  }, [currentYear, yearEndDate]);

  // ISO dates (YYYY-MM-DD) sort lexicographically, so a string min == the
  // earlier date. Clamp to whichever ends first: the loaded data or the horizon.
  const lastRecordDate = snapshot.records.at(-1)?.date ?? todayIso;
  const actualEndDate = forecastVisible
    ? (lastRecordDate < forecastHorizonDate ? lastRecordDate : forecastHorizonDate)
    : todayIso;
  const currentByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of snapshot.records) {
      if (record.date <= actualEndDate) map.set(record.date, record.cumulativeGdd);
    }
    return map;
  }, [snapshot.records, actualEndDate]);

  const projectedByDate = useMemo(() => {
    const map = new Map<string, number>();
    const cutoff = snapshot.records.filter((record) => record.date <= actualEndDate).at(-1);
    if (!show.projection || !cutoff || !normalDailyGddByMonthDay.size || cutoff.date >= yearEndDate) return map;
    let cumulative = cutoff.cumulativeGdd;
    map.set(cutoff.date, cumulative);
    let cursor = new Date(`${cutoff.date}T00:00:00Z`);
    const end = new Date(`${yearEndDate}T00:00:00Z`);
    while (cursor < end) {
      cursor = addUtcDays(cursor, 1);
      const iso = toIsoDate(cursor);
      cumulative += normalDailyGddByMonthDay.get(iso.slice(5)) ?? 0;
      map.set(iso, cumulative);
    }
    return map;
  }, [snapshot.records, actualEndDate, show.projection, normalDailyGddByMonthDay, yearEndDate]);

  const gddChartData = useMemo(
    () =>
      fullYearDates.map((date) => {
        const monthDay = date.slice(5);
        const current = currentByDate.get(date);
        const projected = projectedByDate.get(date);
        const normal = normalCumulativeByMonthDay.get(monthDay);
        const point: Record<string, string | number | undefined> = {
          date: formatDateLabel(date),
          fullDate: date,
          current: typeof current === "number" ? Number((current * unitFactor).toFixed(1)) : undefined,
          projected: typeof projected === "number" ? Number((projected * unitFactor).toFixed(1)) : undefined,
          normal: typeof normal === "number" ? Number((normal * unitFactor).toFixed(1)) : undefined,
        };
        selectedComparisonYears.forEach((year) => {
          const value = comparisonByMonthDay[year]?.get(monthDay);
          point[`year${year}`] = typeof value === "number" ? Number((value * unitFactor).toFixed(1)) : undefined;
        });
        return point;
      }),
    [comparisonByMonthDay, currentByDate, fullYearDates, normalCumulativeByMonthDay, projectedByDate, selectedComparisonYears, unitFactor],
  );

  // ---- ET chart (crop water demand, biofix -> forecast horizon) ----
  const weatherByDate = useMemo(() => new Map(weatherRecords.map((record) => [record.date, record])), [weatherRecords]);
  const etChartData = useMemo(() => {
    let cumulativeEto = 0;
    return snapshot.records.filter((record) => record.date <= actualEndDate).map((record) => {
      const weather = weatherByDate.get(record.date);
      const isForecast = weather?.source === "forecast";
      const monthDay = record.date.slice(5);
      cumulativeEto += weather?.etoMm ?? 0;
      const etoNormal = etoNormalCumulativeByMonthDay.get(monthDay);
      const comparisonEto = Object.fromEntries(
        selectedComparisonYears.map((year) => {
          const value = etoComparisonByMonthDay[year]?.get(monthDay);
          return [`year${year}Eto`, typeof value === "number" ? Number((value * etFactor).toFixed(2)) : undefined];
        }),
      );
      return {
        date: formatDateLabel(record.date),
        fullDate: record.date,
        dailyEtHistorical: isForecast ? undefined : Number((record.etcMm * etFactor).toFixed(2)),
        dailyEtForecast: isForecast ? Number((record.etcMm * etFactor).toFixed(2)) : undefined,
        cumulativeEt: Number((record.cumulativeEtcMm * etFactor).toFixed(2)),
        cumulativeEto: Number((cumulativeEto * etFactor).toFixed(2)),
        etoNormal: typeof etoNormal === "number" ? Number((etoNormal * etFactor).toFixed(2)) : undefined,
        ...comparisonEto,
        petLow: isForecast && typeof weather?.forecastPetP10Mm === "number" ? Number((weather.forecastPetP10Mm * etFactor).toFixed(2)) : undefined,
        petBand:
          isForecast && typeof weather?.forecastPetP10Mm === "number" && typeof weather?.forecastPetP90Mm === "number"
            ? Number(((weather.forecastPetP90Mm - weather.forecastPetP10Mm) * etFactor).toFixed(2))
            : undefined,
      };
    });
  }, [snapshot.records, weatherByDate, etFactor, actualEndDate, etoNormalCumulativeByMonthDay, etoComparisonByMonthDay, selectedComparisonYears]);

  const seasonEtoMm = snapshot.cumulativeEtoMm;
  const observedEtc = snapshot.records.filter((record) => weatherByDate.get(record.date)?.source !== "forecast").at(-1)?.cumulativeEtcMm ?? 0;
  // Crop ET expected across the selected forecast window only (clamped to the horizon).
  const forecastEndEtc = snapshot.records.filter((record) => record.date <= forecastHorizonDate).at(-1)?.cumulativeEtcMm ?? observedEtc;
  const forecastEtcMm = forecastEndEtc - observedEtc;

  // ---- Active chart selection ----
  const chartData = view === "et" ? etChartData : view === "chill" ? chillSeriesData(chillSeries) : gddChartData;

  function chillSeriesData(series: ReturnType<typeof cumulativeChillHours>) {
    return series.map((record) => ({
      date: formatDateLabel(record.date),
      fullDate: record.date,
      daily: record.chillHours,
      current: record.cumulativeChillHours,
    }));
  }

  const monthTicks = useMemo(
    () => gddChartData.filter((point) => String(point.fullDate).slice(8) === "01").map((point) => String(point.date)),
    [gddChartData],
  );

  const stageReferenceGroups = [...numericStages.filter((stage) => stage.gdd > 0).reduce((groups, stage) => {
    const existing = groups.get(stage.gdd);
    if (existing) existing.labels.push(stage.label);
    else groups.set(stage.gdd, { gdd: stage.gdd, labels: [stage.label] });
    return groups;
  }, new Map<number, { gdd: number; labels: string[] }>()).values()].sort((left, right) => left.gdd - right.gdd);

  // Y-axis maxima per view.
  const gddValues = gddChartData.flatMap((point) =>
    ["current", "projected", "normal", ...selectedComparisonYears.map((year) => `year${year}`)]
      .map((key) => point[key])
      .filter((value): value is number => typeof value === "number"),
  );
  const gddReferenceValues = stageReferenceGroups.map((stage) => stage.gdd * unitFactor);
  const gddYAxisMax = Math.max(1, Math.ceil(Math.max(...gddValues, ...gddReferenceValues, 0) * 1.08));
  const resolvedGddYAxisMax = settings.yAxisMax !== null ? settings.yAxisMax * unitFactor : gddYAxisMax;

  function formatGdd(valueC: number | undefined): string {
    if (typeof valueC !== "number") return "--";
    return Math.round(valueC * unitFactor).toLocaleString();
  }

  function formatEt(valueMm: number | undefined): string {
    if (typeof valueMm !== "number") return "--";
    return `${(valueMm * etFactor).toFixed(settings.etUnit === "in" ? 1 : 0)} ${etLabel}`;
  }

  function formatStageDate(projection: { status: string; date?: string } | undefined): string {
    if (!projection?.date) return "--";
    const label = formatDateLabel(projection.date);
    return projection.status === "projected" ? `~${label}` : label;
  }

  function handleExportCsv() {
    const chillByDate = new Map(chillSeries.map((record) => [record.date, record.cumulativeChillHours]));
    const tempSuffix = tempUnitSuffix(unitSystem);
    const columns = [
      { key: "date", label: "Date" },
      { key: "source", label: "Source" },
      { key: "tmin", label: `Tmin (${tempSuffix})` },
      { key: "tmax", label: `Tmax (${tempSuffix})` },
      { key: "dailyGdd", label: `Daily ${unitLabel}` },
      { key: "cumulativeGdd", label: `Cumulative ${unitLabel}` },
      { key: "normalGdd", label: `5-yr Normal Cumulative ${unitLabel}` },
      { key: "etcMm", label: `Crop ET (${etLabel})` },
      { key: "etoMm", label: `Reference ETo (${etLabel})` },
      { key: "etoNormal", label: `5-yr Normal Cumulative Reference ETo (${etLabel})` },
      ...selectedComparisonYears.map((year) => ({ key: `year${year}`, label: `${year} Cumulative ${unitLabel}` })),
      ...selectedComparisonYears.map((year) => ({ key: `year${year}Eto`, label: `${year} Cumulative Reference ETo (${etLabel})` })),
      ...(cropMetrics.chill.enabled ? [{ key: "chill", label: "Cumulative Chill Hours" }] : []),
    ];

    const rows = snapshot.records.map((record) => {
      const monthDay = record.date.slice(5);
      const weather = weatherByDate.get(record.date);
      const normal = normalCumulativeByMonthDay.get(monthDay);
      const etoNormal = etoNormalCumulativeByMonthDay.get(monthDay);
      const row: Record<string, string | number | undefined> = {
        date: record.date,
        source: weather?.source ?? "historical",
        tmin: typeof weather?.tminC === "number" ? celsiusToDisplayTemp(weather.tminC, unitSystem) : undefined,
        tmax: typeof weather?.tmaxC === "number" ? celsiusToDisplayTemp(weather.tmaxC, unitSystem) : undefined,
        dailyGdd: Number((record.gdd * unitFactor).toFixed(1)),
        cumulativeGdd: Number((record.cumulativeGdd * unitFactor).toFixed(1)),
        normalGdd: typeof normal === "number" ? Number((normal * unitFactor).toFixed(1)) : undefined,
        etcMm: Number((record.etcMm * etFactor).toFixed(2)),
        etoMm: typeof weather?.etoMm === "number" ? Number((weather.etoMm * etFactor).toFixed(2)) : undefined,
        etoNormal: typeof etoNormal === "number" ? Number((etoNormal * etFactor).toFixed(2)) : undefined,
        chill: chillByDate.get(record.date),
      };
      selectedComparisonYears.forEach((year) => {
        const value = comparisonByMonthDay[year]?.get(monthDay);
        row[`year${year}`] = typeof value === "number" ? Number((value * unitFactor).toFixed(1)) : undefined;
        const etoValue = etoComparisonByMonthDay[year]?.get(monthDay);
        row[`year${year}Eto`] = typeof etoValue === "number" ? Number((etoValue * etFactor).toFixed(2)) : undefined;
      });
      return row;
    });

    const slug = field.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field";
    downloadCsv(`${slug}-${view}-${todayIso}.csv`, columns, rows);
  }

  const forecastAvailable = forecastWeatherRecords.length > 0 && forecastDays > 0;
  const todayLabel = formatDateLabel(todayIso);

  // Forecast region bounds on the ET chart's category axis. The shaded band runs
  // from the first forecast day (gridMET history lags ~2 days, so the forecast
  // actually starts after today) through the last plotted point.
  const etForecastPoints = etChartData.filter((point) => point.fullDate > todayIso);
  const etForecastStartLabel = etForecastPoints[0]?.date;
  const etForecastEndLabel = etChartData.at(-1)?.date;
  const etForecastRegionVisible = forecastVisible && Boolean(etForecastStartLabel && etForecastEndLabel);

  const overlayLabelItems: OverlayLabelItem[] =
    view === "gdd"
      ? [
          ...(show.stages && show.stageLabels
            ? stageReferenceGroups.map((stage) => ({
                value: stage.gdd * unitFactor,
                text: stage.labels.join(" / "),
                detail: `${formatGdd(stage.gdd)} ${unitLabel}`,
                color: "#2f6f3a",
              }))
            : []),
        ]
      : [];

  const legendItems: Array<{ label: string; color: string; dashed?: boolean; source?: string }> = [];
  if (view === "gdd") {
    if (show.currentSeason)
      legendItems.push({
        label: "Current Season",
        color: "#061827",
        source:
          "Growing degree days accumulated from gridMET daily min/max air temperature, using the averaging method capped at the crop's base and upper thresholds.",
      });
    if (show.projection)
      legendItems.push({
        label: "Projected",
        color: "#061827",
        dashed: true,
        source: "Remaining-season GDD projected by extending today's total along the 5-year average daily accumulation rate.",
      });
    if (show.fiveYearNormal)
      legendItems.push({
        label: "5-yr Average",
        color: "#934936",
        dashed: true,
        source: "Average cumulative GDD on each calendar day across the previous five seasons of gridMET temperatures.",
      });
    if (show.selectedYears)
      selectedComparisonYears.forEach((year, index) =>
        legendItems.push({
          label: `${year}`,
          color: comparisonYearColor(index),
          source: `Cumulative GDD for the ${year} season from gridMET historical temperatures.`,
        }),
      );
    if (show.stages)
      legendItems.push({
        label: "Stage",
        color: "#4a7c59",
        dashed: true,
        source: "Growth-stage GDD thresholds from the selected crop's phenology profile.",
      });
  } else if (view === "chill") {
    legendItems.push({ label: "Current Chill", color: "#061827" });
    if (chillRequirement) legendItems.push({ label: "Chill Target", color: "#4a7c59", dashed: true });
  } else {
    if (show.etCumulative)
      legendItems.push({
        label: "Crop ET (cumulative)",
        color: "#061827",
        source:
          "Cumulative crop ET (ETc): OpenET satellite actual ET when available, otherwise reference ETo \u00d7 the crop coefficient (Kc) for the current growth stage.",
      });
    if (show.referenceEt)
      legendItems.push({
        label: "Reference ETo (this year)",
        color: "#934936",
        dashed: true,
        source: "Cumulative grass-reference ET (ETo) \u2014 atmospheric demand \u2014 for the current season from gridMET history and the Climate Toolbox forecast.",
      });
    if (show.etReferencePriorYear)
      selectedComparisonYears.forEach((year, index) =>
        legendItems.push({
          label: `Reference ETo (${year})`,
          color: etoComparisonYearColor(index),
          source: `Cumulative grass-reference ET (ETo) for the ${year} season from gridMET history \u2014 a same-field, year-over-year atmospheric-demand comparison, aligned to this season by calendar day.`,
        }),
      );
    if (show.etReferenceNormal)
      legendItems.push({
        label: "Reference ETo (5-yr avg)",
        color: ETO_NORMAL_COLOR,
        dashed: true,
        source: "Average cumulative grass-reference ET (ETo) on each calendar day across the previous five seasons of gridMET history \u2014 the \u201cnormal\u201d atmospheric demand for this field.",
      });
    if (show.etDailyBars) {
      legendItems.push({
        label: "Daily ET",
        color: "#4a7c59",
        source: "Daily crop ET (ETc) from gridMET-based history (OpenET actual ET, or ETo \u00d7 Kc).",
      });
      if (forecastVisible)
        legendItems.push({
          label: "Daily ET (forecast)",
          color: "#d29b4e",
          source: "Daily crop ET projected from the Climate Toolbox CFS forecast.",
        });
    }
  }

  const renderStageLabels = (rcProps: {
    width?: number;
    yAxisMap?: Record<string, { scale: (value: number) => number }>;
    offset?: { top: number; left: number; width: number; height: number };
  }) => <StageLabelsOverlay items={overlayLabelItems} width={rcProps.width} yAxisMap={rcProps.yAxisMap} offset={rcProps.offset} />;

  const viewSubtitle =
    view === "gdd"
      ? `${cropDisplayName} cumulative GDD across ${currentYear}, with last year and the 5-yr average`
      : view === "chill"
        ? `${cropDisplayName} cumulative chill hours this dormant season`
        : `${cropDisplayName} crop water demand (ET) for the season, with reference ETo and prior-year comparison`;

  const metricCards =
    view === "gdd"
      ? [
          {
            label: "Current",
            value: observedRecords.length ? `${formatGdd(gddToDateC)} ${unitLabel}` : "Pending",
            detail: currentStage ? `Stage: ${currentStage.label}` : "Awaiting accumulation",
            icon: ThermometerSun,
            info: `Cumulative GDD to date between the ${celsiusToDisplayTemp(metricCrop.tBaseC, unitSystem)}${tempUnitSuffix(unitSystem)} base and ${celsiusToDisplayTemp(metricCrop.tUpperC, unitSystem)}${tempUnitSuffix(unitSystem)} upper thresholds from the ${formatDateLabel(selectedStartDate)} biofix.`,
          },
          {
            label: "5-yr Average",
            value: typeof normalToDateC === "number" ? `${formatGdd(normalToDateC)} ${unitLabel}` : "Pending",
            detail: "Average to date",
            icon: Gauge,
            info: "Average cumulative GDD on today's date across the prior five seasons.",
          },
          {
            label: "Difference",
            value: typeof gddVsNormalC === "number" ? `${gddVsNormalC >= 0 ? "+" : "-"}${formatGdd(Math.abs(gddVsNormalC))} ${unitLabel}` : "Pending",
            detail: typeof daysVsNormal === "number" ? `${Math.abs(daysVsNormal)} days ${daysVsNormal >= 0 ? "ahead" : "behind"}` : "vs 5-yr average",
            icon: CalendarClock,
            info: "Current-season GDD minus the 5-yr average for today, with the equivalent days ahead or behind.",
          },
          {
            label: "Forecast",
            value: forecastAvailable ? `+${formatGdd(forecastGddC)} ${unitLabel}` : "Unavailable",
            detail: forecastAvailable ? `Next ${forecastDays} days` : "No forecast loaded",
            icon: Sprout,
            info: "Additional GDD expected across the forecast window beyond today.",
          },
        ]
      : view === "chill"
        ? [
            {
              label: "Chill Accrued",
              value: chillWeatherRecords.length ? `${Math.round(currentChillHours).toLocaleString()} hrs` : "Pending",
              detail: chillSeasonStart ? `Since ${formatDateLabel(chillSeasonStart)}` : "Dormant season",
              icon: ThermometerSun,
              info: `Cumulative hours between ${settings.chillThresholdMinC}°C and ${settings.chillThresholdMaxC}°C this dormant season.`,
            },
            {
              label: "Requirement",
              value: chillRequirement ? `${chillRequirement.toLocaleString()} hrs` : "n/a",
              detail: "Crop chill need",
              icon: Gauge,
              info: "Approximate chill-hour requirement for this crop profile.",
            },
            {
              label: "Progress",
              value: typeof chillPercent === "number" ? `${chillPercent}%` : "--",
              detail: "Toward requirement",
              icon: CalendarClock,
              info: "Share of the crop's chill requirement accumulated so far.",
            },
          ]
        : [
            {
              label: "Season ET",
              value: snapshot.records.length ? formatEt(observedEtc) : "Pending",
              detail: "Crop water used to date",
              icon: Droplets,
              info: "Cumulative crop evapotranspiration (ETc) to date, derived from reference ET and the crop coefficient.",
            },
            {
              label: "Reference ETo",
              value: snapshot.records.length ? formatEt(seasonEtoMm) : "Pending",
              detail: "Atmospheric demand",
              icon: Gauge,
              info: "Cumulative reference evapotranspiration (gridMET ETo) over the season window.",
            },
            {
              label: "Forecast ET",
              value: forecastAvailable ? `+${formatEt(forecastEtcMm)}` : "Unavailable",
              detail: forecastAvailable ? `Next ${forecastDays} days` : "No forecast loaded",
              icon: Sprout,
              info: "Additional crop ET expected across the forecast window beyond today.",
            },
          ];

  const chartReady = !weatherLoading && chartData.length > 0;

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <div className="heading-row">
            <h1>Growing Season Insights</h1>
            <span className="season-badge">{currentYear}</span>
            <span className="data-source-badge">
              {historicalWeatherRecords.length
                ? forecastAvailable
                  ? `Live weather + ${forecastDays}-day forecast`
                  : "Live weather"
                : weatherLoading
                  ? "Loading weather"
                  : "Weather unavailable"}
            </span>
          </div>
          <p>
            {field.name} - {field.cropLabel}
          </p>
          {dataWarning ? <p className="data-warning">{dataWarning}</p> : null}
        </div>
        <div className="toolbar">
          <button className="primary-button" type="button" onClick={handleExportCsv} disabled={!snapshot.records.length}>
            <Download size={18} />
            Export Data
          </button>
        </div>
      </div>

      <section className="metrics-grid">
        {metricCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} detail={card.detail} icon={card.icon} tone="success" info={card.info} />
        ))}
      </section>

      <section className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-title-row">
            <div>
              <h2>Crop Metrics Tracker</h2>
              <p>{viewSubtitle}</p>
            </div>
            <div className="segmented">
              <button className={view === "gdd" ? "selected" : ""} type="button" onClick={() => setView("gdd")}>
                GDD
              </button>
              <button className={view === "chill" ? "selected" : ""} type="button" onClick={() => setView("chill")} disabled={!cropMetrics.chill.enabled}>
                Chill
              </button>
              <button className={view === "et" ? "selected" : ""} type="button" onClick={() => setView("et")}>
                ET
              </button>
            </div>
          </div>

          <InlineMetricControls
            view={view}
            settings={settings}
            onChange={setSettings}
            chillRequirement={chillRequirement}
            onOpenAdvanced={() => setAdvancedOpen(true)}
          />

          <div className="chart-wrap">
            {chartReady ? (
              <ResponsiveContainer width="100%" height="100%">
                {view === "et" ? (
                  <ComposedChart data={etChartData} margin={{ top: 28, right: 24, bottom: 16, left: 12 }}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} height={42} />
                    <YAxis yAxisId="cumulative" tickLine={false} axisLine={false} width={58} tickMargin={8} tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="daily" orientation="right" tickLine={false} axisLine={false} width={46} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#ffffff", border: "1px solid #9fa89d", borderRadius: 3, color: "#061827", fontWeight: 800 }}
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          dailyEtHistorical: "Daily ET",
                          dailyEtForecast: "Daily ET (forecast)",
                          cumulativeEt: "Crop ET",
                          cumulativeEto: "Reference ETo (this year)",
                          etoNormal: "Reference ETo (5-yr avg)",
                        };
                        selectedComparisonYears.forEach((year) => {
                          labels[`year${year}Eto`] = `Reference ETo (${year})`;
                        });
                        if (name === "petLow" || name === "petBand") return ["", ""] as [string, string];
                        return [`${Number(value).toFixed(2)} ${etLabel}`, labels[String(name)] ?? String(name)];
                      }}
                      labelFormatter={(label) => etChartData.find((point) => point.date === label)?.fullDate ?? label}
                    />
                    {show.forecastBand ? (
                      <>
                        <Area yAxisId="daily" type="monotone" dataKey="petLow" stackId="pet" stroke="none" fill="none" />
                        <Area yAxisId="daily" type="monotone" dataKey="petBand" stackId="pet" stroke="none" fill="#d29b4e" fillOpacity={0.18} />
                      </>
                    ) : null}
                    {show.etDailyBars ? (
                      <>
                        <Bar yAxisId="daily" dataKey="dailyEtHistorical" fill="#4a7c59" barSize={6} />
                        <Bar yAxisId="daily" dataKey="dailyEtForecast" fill="#d29b4e" fillOpacity={0.92} barSize={6} />
                      </>
                    ) : null}
                    {show.etReferenceNormal ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="etoNormal" stroke={ETO_NORMAL_COLOR} strokeDasharray="5 4" dot={false} strokeWidth={1.8} strokeOpacity={0.85} connectNulls />
                    ) : null}
                    {show.etReferencePriorYear
                      ? selectedComparisonYears.map((year, index) => (
                          <Line
                            key={`eto-${year}`}
                            yAxisId="cumulative"
                            type="monotone"
                            dataKey={`year${year}Eto`}
                            stroke={etoComparisonYearColor(index)}
                            dot={false}
                            strokeWidth={1.6}
                            strokeOpacity={0.82}
                            connectNulls
                          />
                        ))
                      : null}
                    {show.referenceEt ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="cumulativeEto" stroke="#934936" strokeDasharray="6 5" dot={false} strokeWidth={2} />
                    ) : null}
                    {show.etCumulative ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="cumulativeEt" stroke="#061827" dot={false} strokeWidth={3} />
                    ) : null}
                    {etForecastRegionVisible ? (
                      <ReferenceLine
                        yAxisId="cumulative"
                        x={etForecastStartLabel}
                        stroke="#a9762f"
                        strokeDasharray="4 3"
                        strokeOpacity={0.85}
                        strokeWidth={1.5}
                      />
                    ) : null}
                  </ComposedChart>
                ) : (
                  <ComposedChart data={chartData} margin={{ top: 28, right: 178, bottom: 16, left: 12 }}>
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      ticks={view === "gdd" ? monthTicks : undefined}
                      minTickGap={view === "gdd" ? 0 : 24}
                      tick={{ fontSize: 11 }}
                      height={42}
                    />
                    <YAxis
                      yAxisId="cumulative"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      domain={view === "gdd" ? [0, resolvedGddYAxisMax] : [0, "auto"]}
                      tickMargin={8}
                      tick={{ fontSize: 12 }}
                      label={{
                        value: view === "gdd" ? `Cumulative ${unitLabel}` : "Cumulative Chill Hours",
                        angle: -90,
                        position: "insideLeft",
                        offset: 2,
                        dy: 68,
                        fill: "#687078",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(74, 124, 89, 0.18)", stroke: "#2f6f3a", strokeWidth: 1.5 }}
                      contentStyle={{ background: "#ffffff", border: "1px solid #9fa89d", borderRadius: 3, color: "#061827", fontWeight: 800 }}
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          current: view === "gdd" ? "Current Season" : "Current Chill",
                          projected: "Projected",
                          normal: "5-yr Average",
                        };
                        comparisonYears.forEach((year) => {
                          labels[`year${year}`] = `${year}`;
                        });
                        return [`${Number(value).toFixed(1)}`, labels[String(name)] ?? String(name)];
                      }}
                      labelFormatter={(label) => chartData.find((point) => point.date === label)?.fullDate ?? label}
                    />
                    {view === "gdd" && show.fiveYearNormal ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="normal" stroke="#934936" strokeDasharray="6 5" dot={false} strokeWidth={2} />
                    ) : null}
                    {view === "gdd" && show.stages
                      ? stageReferenceGroups.map((stage) => (
                          <ReferenceLine key={stage.gdd} yAxisId="cumulative" y={stage.gdd * unitFactor} stroke="#4a7c59" strokeDasharray="3 5" strokeOpacity={0.72} />
                        ))
                      : null}
                    {view === "gdd" && show.selectedYears
                      ? selectedComparisonYears.map((year, index) => (
                          <Line
                            key={year}
                            yAxisId="cumulative"
                            type="monotone"
                            dataKey={`year${year}`}
                            stroke={comparisonYearColor(index)}
                            dot={show.dataMarkers}
                            strokeWidth={1.8}
                            strokeOpacity={0.72}
                            connectNulls
                          />
                        ))
                      : null}
                    {view === "gdd" && show.projection ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="projected" stroke="#061827" strokeDasharray="5 5" dot={false} strokeWidth={2} strokeOpacity={0.7} connectNulls />
                    ) : null}
                    {(view === "gdd" ? show.currentSeason : true) ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="current" stroke="#061827" dot={show.dataMarkers} strokeWidth={3} connectNulls />
                    ) : null}
                    {view === "gdd" ? <ReferenceLine yAxisId="cumulative" x={todayLabel} stroke="#687078" strokeDasharray="2 4" strokeOpacity={0.7} /> : null}
                    {view === "chill" && chillRequirement ? (
                      <ReferenceLine
                        yAxisId="cumulative"
                        y={chillRequirement}
                        stroke="#4a7c59"
                        strokeDasharray="3 5"
                        strokeOpacity={0.75}
                        label={(props) => <StageReferenceLabel {...props} value="Chill target" detail={`${chillRequirement.toLocaleString()} hrs`} dy={-8} />}
                      />
                    ) : null}
                    {overlayLabelItems.length ? <Customized component={renderStageLabels} /> : null}
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            ) : null}
            {weatherLoading ? (
              <div className="chart-loading-overlay" role="status" aria-live="polite">
                <div className="chart-skeleton" aria-hidden="true" />
                <div className="chart-loader-stack">
                  <TomatoLoader size={200} label="Loading crop metrics" />
                  <span className="chart-loading-label">Loading crop metrics…</span>
                </div>
              </div>
            ) : null}
            {chartReady && overlaysLoading && (view === "gdd" || view === "et") ? <div className="chart-overlay-hint">Loading comparison overlays…</div> : null}
            {!weatherLoading && !chartData.length ? <div className="chart-empty">No weather records loaded for this field and date range.</div> : null}
          </div>

          <div className="legend">
            {legendItems.map((item) => (
              <span key={item.label} className="legend-item">
                <span className="legend-swatch" style={{ borderTopColor: item.color, borderTopStyle: item.dashed ? "dashed" : "solid" }} />
                {item.label}
                {item.source ? (
                  <span className="legend-info" tabIndex={0} aria-label={item.source}>
                    <Info size={13} />
                    <span className="legend-info-tooltip">{item.source}</span>
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </section>

        {view === "gdd" ? (
          <section className="panel stage-timeline-panel">
            <div className="panel-title-row">
              <div>
                <h2>Growth Stage Timeline</h2>
                <p>
                  Dates each {cropDisplayName.toLowerCase()} stage was reached or is projected this season
                  {priorYearForTimeline ? `, with ${priorYearForTimeline} alongside for comparison` : ""}.
                </p>
              </div>
            </div>
            {stageProjections.length === 0 ? (
              <p className="stage-timeline-empty">No growth stages defined for this crop. Add stage thresholds in the field setup to project stage dates.</p>
            ) : (
            <table className="stage-timeline-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Threshold ({unitLabel})</th>
                  <th>Status</th>
                  <th>{getIsoYear(todayIso)}</th>
                  <th>{priorYearForTimeline ?? "Prior Year"}</th>
                  <th>Shift</th>
                </tr>
              </thead>
              <tbody>
                {stageProjections.map((projection) => {
                  const priorDate = priorYearStageDates[projection.label];
                  const shiftDays =
                    projection.date && priorDate ? dayDistance(setIsoYear(priorDate, getIsoYear(projection.date)), projection.date) : undefined;
                  return (
                    <tr key={`${projection.label}-${projection.thresholdGdd}`} className={projection.status === "reached" ? "stage-row-reached" : ""}>
                      <td>{projection.label}</td>
                      <td>{formatGdd(projection.thresholdGdd)}</td>
                      <td>
                        <span className={`stage-status stage-status-${projection.status}`}>
                          {projection.status === "reached"
                            ? "Reached"
                            : projection.status === "forecast"
                              ? "In forecast"
                              : projection.status === "projected"
                                ? "Projected"
                                : "Beyond projection"}
                        </span>
                      </td>
                      <td>{formatStageDate(projection)}</td>
                      <td>{priorDate ? formatDateLabel(priorDate) : "--"}</td>
                      <td>
                        {typeof shiftDays === "number"
                          ? shiftDays === 0
                            ? "Same"
                            : `${Math.abs(shiftDays)}d ${shiftDays < 0 ? "earlier" : "later"}`
                          : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
            <p className="stage-timeline-footnote">
              Projected dates use the 28-day forecast, then extend along the average accumulation of the past five seasons. Prior-year dates apply the same
              thresholds and biofix month-day to that year's weather.
              {nextStageProjection?.date ? ` Next up: ${nextStage?.label} ~${formatDateLabel(nextStageProjection.date)}.` : ""}
            </p>
          </section>
        ) : null}
      </section>

      <AdvancedGraphSettings
        open={advancedOpen}
        view={view}
        settings={settings}
        onChange={setSettings}
        onClose={() => setAdvancedOpen(false)}
        onReset={resetSettings}
        seasonStartDate={seasonStartDate}
        todayIso={todayIso}
        minYear={1940}
        maxYear={getIsoYear(todayIso) - 1}
        biofixLabel={cropMetrics.gdd.biofixLabel}
        onEditStages={onEditStages}
      />
    </main>
  );
}
