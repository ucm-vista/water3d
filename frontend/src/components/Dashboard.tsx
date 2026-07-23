import { CalendarClock, Download, Droplets, Gauge, Image as ImageIcon, Info, LoaderCircle, Sprout, ThermometerSun } from "lucide-react";
import { Area, Bar, Customized, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsRestoring } from "@tanstack/react-query";
import { climateToolboxApi } from "../api/climate";
import { gridMetApi } from "../api/gridMet";
import {
  seasonWeatherEnabled,
  useAnalyticsSnapshot,
  useChillClimatology,
  useChillSeries,
  useChillWeather,
  useClimatology,
  useSeasonWeather,
  useStageProjections,
  useYearWeather,
} from "../api/queries";
import { buildAnalyticsSnapshot } from "../calcs/analytics";
import { cumulativeChillHours, getChillSeasonStart } from "../calcs/chillHours";
import { cumulativeChillPortions } from "../calcs/dynamicModel";
import { splitSeasonSeries } from "../calcs/gddSeries";
import { daysAheadOfNormal, findThresholdDate } from "../calcs/stageProjection";
import { cropProfiles } from "../data/crops";
import { getCropMetricProfile } from "../data/cropMetrics";
import type { FieldConfig, WeatherRecord } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { addUtcDays, getCurrentYearStartDate, getRollingDateRange, toIsoDate } from "../utils/dateRange";
import { downloadCsv } from "../utils/exportCsv";
import {
  celsiusToDisplayTemp,
  etUnitFactor,
  etUnitForSystem,
  etUnitLabel,
  gddUnitFactor,
  gddUnitLabel,
  tempUnitSuffix,
} from "../utils/units";
import { useUnits } from "../state/UnitsContext";
import { buildFieldPrefs, localPreferencesRepository, mergeGraphSettings } from "../utils/preferencesStorage";
import { MetricCard } from "./MetricCard";
import { AdvancedGraphSettings } from "./AdvancedGraphSettings";
import { InlineMetricControls, type ChillModel, type EtChartMode, type GddChartMode, type MetricView } from "./InlineMetricControls";
import { ChartLoader } from "./ChartLoader";
import { buildDefaultGraphSettings, FORECAST_RANGE_OPTIONS, type GraphSettings } from "./graphSettings";

// The forecast fetch always pulls the widest selectable window; the UI then
// clamps what it *shows* to the range the user picked. Keep these in sync so a
// "+28 days" selection never asks for more data than we requested.
const MAX_FORECAST_DAYS = Math.max(...FORECAST_RANGE_OPTIONS);
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

interface DashboardProps {
  field: FieldConfig;
  onEditStages?: () => void;
}

// GDD chart series colors. Current year (observed history + its dashed
// projection) reads bright red; the 30-year climatological normal (line and
// median) reads bright aqua — a distinct hue from the current-season red and the
// pale-blue P10–P90 band — and is labelled "Historical (30 year average)".
// Series hues come from the validated bright categorical palette (dataviz skill,
// validated on the white chart surface with the historical line dashed for CVD).
const GDD_CURRENT_COLOR = "#e34948";
const GDD_NORMAL_COLOR = "#1baf7a";
const GDD_NORMAL_BAND_COLOR = "#bcd3ea";

// Chill view: the observed line reuses the red current-season color; the
// precomputed 1979–2022 normal band + P50 median read blue, mirroring the GDD
// current-vs-normal contrast.
const CHILL_NORMAL_COLOR = "#2a78d6";

// Optional prior-season overlays — bright palette hues held clear of the red
// current-season line (blue / violet / green).
const COMPARISON_YEAR_COLORS = ["#2a78d6", "#4a3aa7", "#008300"];

function comparisonYearColor(index: number): string {
  return COMPARISON_YEAR_COLORS[index % COMPARISON_YEAR_COLORS.length];
}

// Human-readable coordinates for the chart title, e.g. "36.7378° N, 119.7871° W".
function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

// Reference-ETo year-over-year overlays use a cooler (blue) palette so they read
// as the "reference ETo" family yet stay distinct from the rust current-season
// reference ETo line and the crop-ET / daily-bar colors.
const ETO_COMPARISON_YEAR_COLORS = ["#5f8fc0", "#4f8a8b", "#8a86c9"];
const ETO_NORMAL_COLOR = "#3f6486";
// ET "water balance" view: crop ET (demand, bright red) vs precipitation
// (supply, bright blue). The gap between them — the ET − precip difference — is a
// bold violet, a hue distinct from every line so the shortfall stands alone.
const CROP_ET_COLOR = "#e34948";
const PRECIP_NORMAL_COLOR = "#2a78d6";
// Historical (30-yr) precipitation normal + band: bright aqua, matching the GDD
// historical hue and distinct from the blue current-year supply line (drawn
// dashed for CVD separation from the red demand line).
const PRECIP_HISTORICAL_COLOR = "#1baf7a";
const WATER_DEFICIT_COLOR = "#4a3aa7";

// Bar minPointSize callback: give any measurable rain a 2px-minimum stub so
// trace amounts stay visible, while zero (dry) days draw nothing.
function visibleRainStub(value: number | undefined | null): number {
  return typeof value === "number" && value > 0 ? 2 : 0;
}

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

const EMPTY_RECORDS: WeatherRecord[] = [];

// Narrow a year->weather map to a specific set of years (the comparison
// selection) drawn from the shared per-year cache.
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

  // Default overlays: 30-yr normal only. Comparison years start unselected and
  // are added by the user via Advanced settings.
  const defaultSettings = useMemo(
    () =>
      buildDefaultGraphSettings({
        startDate: defaultStartDate,
        endDate: todayIso,
        forecastDays: climateToolboxApi.enabled ? 28 : 0,
        comparisonYears: cropMetrics.comparisonYears,
        selectedComparisonYears: [],
        gddBaseTempC: field.gddBaseTempC ?? cropMetrics.gdd.baseTempC,
        gddUpperTempC: field.gddUpperTempC ?? cropMetrics.gdd.upperTempC,
        chillThresholdMinC: cropMetrics.chill.thresholdMinC ?? 0,
        chillThresholdMaxC: cropMetrics.chill.thresholdMaxC ?? 7.2,
      }),
    [cropMetrics, defaultStartDate, field.gddBaseTempC, field.gddUpperTempC, todayIso],
  );

  // Single live settings object — every control writes through and the chart
  // updates immediately (no draft/apply gate).
  const [settings, setSettings] = useState<GraphSettings>(defaultSettings);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [view, setView] = useState<MetricView>("gdd");
  // GDD view can render either the cumulative curve or daily-accumulation bars
  // (the reviewer asked for a bar option alongside the cumulative chart).
  const [gddChartMode, setGddChartMode] = useState<GddChartMode>("cumulative");
  // ET view renders one curve family at a time (reviewer feedback: crop ET and
  // reference ET on one chart read as clutter), plus a precipitation mode.
  const [etChartMode, setEtChartMode] = useState<EtChartMode>("cropEt");
  // Chill view flips between Dynamic-Model portions and classic chill hours
  // (the "flip-flop" asked for in review; hours use the crop's threshold band).
  const [chillModel, setChillModel] = useState<ChillModel>("portions");
  const [exportingImage, setExportingImage] = useState(false);
  // Captured by the "Export Image" action (title + chart + legend → PNG).
  const chartPanelRef = useRef<HTMLElement>(null);
  const fileSlug = useMemo(
    () => field.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field",
    [field.name],
  );

  const selectedStartDate = settings.startDate;
  const forecastDays = settings.forecastDays;
  const { unitSystem } = useUnits();
  const unitFactor = gddUnitFactor(unitSystem);
  const unitLabel = gddUnitLabel(unitSystem);
  const etUnit = etUnitForSystem(unitSystem);
  const etFactor = etUnitFactor(etUnit);
  const etLabel = etUnitLabel(etUnit);
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
  // Every non-GDD request waits for the temperature-only season query. This
  // keeps the default chart on the critical path and lets the rest hydrate in
  // one background wave after GDD is usable.
  const backgroundQueriesEnabled = seasonQuery.isSuccess;
  const weatherRecords = seasonQuery.data?.records ?? EMPTY_RECORDS;

  const chillQuery = useChillWeather({
    cropId: field.cropId,
    lat: field.lat,
    lon: field.lon,
    fieldId: field.id,
    chillSeasonStart,
    todayIso,
    enabled: backgroundQueriesEnabled,
  });
  const chillWeatherRecords = chillQuery.data ?? EMPTY_RECORDS;

  // Comparison overlays share one per-year cache; toggling which years are
  // shown never refetches a year already loaded this session. The 30-yr normal
  // curves come from the separate climatology query below.
  const yearWeather = useYearWeather({
    cropId: field.cropId,
    lat: field.lat,
    lon: field.lon,
    years: selectedComparisonYears,
    currentYear,
    enabled: backgroundQueriesEnabled,
  });
  const comparisonWeatherByYear = useMemo(
    () => pickYears(yearWeather.byYear, selectedComparisonYears),
    [yearWeather.byYear, selectedComparisonYears],
  );

  // 30-year climatology (mean + P10/P50/P90 by calendar day) for the "normal"
  // overlays, percentile bands, and the stage-projection daily rate.
  const climatology = useClimatology({
    lat: field.lat,
    lon: field.lon,
    currentYear,
    gddBaseTempC: settings.gddBaseTempC,
    gddUpperTempC: settings.gddUpperTempC,
    alignStartMonthDay: selectedStartDate.slice(5),
    enabled: backgroundQueriesEnabled,
  });

  // Strict TTL: show the loader while the persisted cache is still restoring,
  // while there is no usable data, or while a stale (expired) entry is being
  // revalidated — never render stale data.
  const primaryWeatherLoading =
    seasonWeatherEnabled && (isRestoring || seasonQuery.isLoading || (seasonQuery.isFetching && seasonQuery.isStale));
  const overlaysLoading = gridMetApi.enabled && (yearWeather.isFetching || climatology.isFetching);
  const dataWarning = useMemo<string | null>(() => {
    if (!seasonWeatherEnabled) return "gridMET and Climate Toolbox are disabled. No weather data will be displayed.";
    if (seasonQuery.isError) return seasonQuery.error instanceof Error ? seasonQuery.error.message : "Weather data could not be loaded.";
    const warnings = seasonQuery.data?.warnings ?? [];
    return warnings.length ? warnings.join(" ") : null;
  }, [seasonQuery.data, seasonQuery.isError, seasonQuery.error]);

  // Tracks the field id + biofix the live settings were last reconciled against,
  // so we can tell a field *switch* (restore that field's saved window) apart
  // from a biofix *edit* on the current field (the field value must win).
  const lastReconciled = useRef<{ fieldId: string; biofix: string } | null>(null);

  // When the field changes, rebuild live settings from this field/crop's
  // defaults merged with any persisted preferences for the field.
  useEffect(() => {
    const prefs = localPreferencesRepository.load(field.id);
    const merged = mergeGraphSettings(defaultSettings, prefs, { cropId: field.cropId, currentYear });
    // Editing the biofix in the sidebar is authoritative for the season window:
    // the persisted start date was relative to the *old* biofix, so don't let it
    // shadow the new one (otherwise the chart never moves). A field switch keeps
    // the persisted window instead.
    const biofixEdited =
      lastReconciled.current?.fieldId === field.id && lastReconciled.current.biofix !== field.stageStartDate;
    setSettings(biofixEdited ? { ...merged, startDate: defaultSettings.startDate } : merged);
    lastReconciled.current = { fieldId: field.id, biofix: field.stageStartDate };
    setAdvancedOpen(false);
    setView("gdd");
    setGddChartMode(prefs?.cropId === field.cropId ? (prefs?.gddChartMode ?? "cumulative") : "cumulative");
    setEtChartMode(prefs?.cropId === field.cropId ? (prefs?.etChartMode ?? "cropEt") : "cropEt");
    setChillModel(prefs?.cropId === field.cropId ? (prefs?.chillModel ?? "portions") : "portions");
  }, [defaultSettings, field.id, field.cropId, field.stageStartDate, currentYear]);

  // Write-through persistence: any settings/mode change updates the stored
  // per-field preferences (small payload, so no debounce needed).
  useEffect(() => {
    localPreferencesRepository.save(field.id, buildFieldPrefs(settings, { gddChartMode, etChartMode, chillModel }, field.cropId));
  }, [settings, gddChartMode, etChartMode, chillModel, field.id, field.cropId]);

  function resetSettings() {
    localPreferencesRepository.clear(field.id);
    setSettings(defaultSettings);
    setGddChartMode("cumulative");
    setEtChartMode("cropEt");
    setChillModel("portions");
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
  // Overlay curves aligned to the current season by calendar day (MM-DD), read
  // from the 30-yr climatology stats.
  const climatologyByMonthDay = climatology.stats?.byMonthDay;
  const normalCumulativeByMonthDay = useMemo(
    () => new Map(Object.entries(climatologyByMonthDay ?? {}).map(([key, day]) => [key, day.gddCumMean])),
    [climatologyByMonthDay],
  );
  const comparisonByMonthDay = useMemo(() => {
    const maps: Record<number, Map<string, number>> = {};
    for (const [yearKey, comparisonSnapshot] of Object.entries(comparisonSnapshotsByYear)) {
      maps[Number(yearKey)] = new Map(comparisonSnapshot.records.map((record) => [record.date.slice(5), record.cumulativeGdd]));
    }
    return maps;
  }, [comparisonSnapshotsByYear]);
  const normalDailyGddByMonthDay = useMemo(
    () => new Map(Object.entries(climatologyByMonthDay ?? {}).map(([key, day]) => [key, day.gddDailyMean])),
    [climatologyByMonthDay],
  );

  // Reference-ETo (atmospheric demand) year-over-year overlays for the ET view,
  // aligned by calendar day (MM-DD) like the GDD overlays. Deliberately built
  // from cumulative *reference* ETo rather than crop ETc: ETc rides the Kc/stage
  // curve, whose timing shifts year to year, so ETo isolates the weather-year
  // difference that a "was this a thirstier season" comparison actually wants.
  const etoNormalCumulativeByMonthDay = useMemo(
    () => new Map(Object.entries(climatologyByMonthDay ?? {}).map(([key, day]) => [key, day.etoCumMean])),
    [climatologyByMonthDay],
  );
  const precipNormalCumulativeByMonthDay = useMemo(
    () => new Map(Object.entries(climatologyByMonthDay ?? {}).map(([key, day]) => [key, day.precipCumMean])),
    [climatologyByMonthDay],
  );
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

  // Precomputed chill (observed Dynamic-Model portions + the Oct1-anchored
  // 1979–2022 normal band) is the primary source; the client Dynamic Model over
  // Open-Meteo hourly temps stays as a fallback when the precomputed observed
  // file is unavailable (it is year-versioned and lives under a testing path).
  const chillClimatology = useChillClimatology({
    lat: field.lat,
    lon: field.lon,
    todayIso,
    enabled: backgroundQueriesEnabled && cropMetrics.chill.enabled,
  });
  const chillPrecomputed = chillClimatology.data;
  // Precomputed portions (and their band) only apply in portions mode — chill
  // hours are computed on-device against the user's threshold band.
  const chillUsesPrecomputed = chillModel === "portions" && Boolean(chillPrecomputed?.hasObserved);
  // Only draw the band alongside the precomputed observed line so both share the
  // Oct-1 anchor (the band cannot be validly re-anchored to the fallback's Nov-1).
  const chillShowBand = chillUsesPrecomputed && Boolean(chillPrecomputed?.hasBand);
  const chillFallback = useChillSeries(chillWeatherRecords);
  const chillHoursSeries = useMemo(
    () =>
      chillModel === "hours"
        ? cumulativeChillHours(chillWeatherRecords, settings.chillThresholdMinC, settings.chillThresholdMaxC)
        : [],
    [chillModel, chillWeatherRecords, settings.chillThresholdMinC, settings.chillThresholdMaxC],
  );
  const currentChillPortions = chillUsesPrecomputed
    ? chillPrecomputed?.currentCumulative ?? 0
    : chillFallback.at(-1)?.cumulativePortions ?? 0;
  const currentChillHours = chillHoursSeries.at(-1)?.cumulativeChillHours ?? 0;
  const chillAccrualStart = chillUsesPrecomputed ? chillPrecomputed?.seasonStart : chillSeasonStart;
  const chillRequirement = cropMetrics.chill.requirement;
  // The stored requirement is in Chill Portions, so target/progress only make
  // sense in portions mode.
  const chillPercent = chillModel === "portions" && chillRequirement ? Math.round((currentChillPortions / chillRequirement) * 100) : undefined;

  // ---- Full calendar-year GDD chart (Jan 1 -> Dec 31) ----
  // Solid current season = observed history; the dashed projection carries the
  // forecast and, past it, the 30-yr-average daily rate up to the horizon.
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
  const weatherByDate = useMemo(() => new Map(weatherRecords.map((record) => [record.date, record])), [weatherRecords]);

  // Solid line = observed days only; dashed line = seam + forecast days + (when
  // enabled) a normal-rate extension to the horizon. gridMET lags ~2 days, so
  // the split runs on record *source*, not on today's date — the merged records
  // for today and yesterday are usually forecast-backed and must render dashed.
  const { currentByDate, projectedByDate } = useMemo(
    () =>
      splitSeasonSeries({
        records: snapshot.records,
        isForecastDate: (date) => weatherByDate.get(date)?.source === "forecast",
        actualEndDate,
        forecastHorizonDate,
        includeProjection: show.projection,
        normalDailyGddByMonthDay,
      }),
    [snapshot.records, weatherByDate, actualEndDate, forecastHorizonDate, show.projection, normalDailyGddByMonthDay],
  );

  const gddChartData = useMemo(
    () =>
      fullYearDates.map((date) => {
        const monthDay = date.slice(5);
        const current = currentByDate.get(date);
        const projected = projectedByDate.get(date);
        const normal = normalCumulativeByMonthDay.get(monthDay);
        const dayStats = climatologyByMonthDay?.[monthDay];
        const point: Record<string, string | number | [number, number] | undefined> = {
          date: formatDateLabel(date),
          fullDate: date,
          current: typeof current === "number" ? Number((current * unitFactor).toFixed(1)) : undefined,
          projected: typeof projected === "number" ? Number((projected * unitFactor).toFixed(1)) : undefined,
          normal: typeof normal === "number" ? Number((normal * unitFactor).toFixed(1)) : undefined,
          // Recharts native range area: a single [low, high] value renders a
          // band with no invisible-baseline stacking hack.
          normalRange: dayStats
            ? ([Number((dayStats.gddCumP10 * unitFactor).toFixed(1)), Number((dayStats.gddCumP90 * unitFactor).toFixed(1))] as [number, number])
            : undefined,
          normalP50: dayStats ? Number((dayStats.gddCumP50 * unitFactor).toFixed(1)) : undefined,
        };
        selectedComparisonYears.forEach((year) => {
          const value = comparisonByMonthDay[year]?.get(monthDay);
          point[`year${year}`] = typeof value === "number" ? Number((value * unitFactor).toFixed(1)) : undefined;
        });
        return point;
      }),
    [climatologyByMonthDay, comparisonByMonthDay, currentByDate, fullYearDates, normalCumulativeByMonthDay, projectedByDate, selectedComparisonYears, unitFactor],
  );

  // ---- Daily GDD bars (biofix -> forecast horizon) ----
  // Same date window as the cumulative "current" line, but each point carries the
  // *daily* GDD so it can render as a histogram. Historical vs forecast days are
  // split into separate keys so they can be colored distinctly.
  const gddDailyChartData = useMemo(
    () =>
      snapshot.records
        .filter((record) => record.date <= actualEndDate)
        .map((record) => {
          const isForecast = weatherByDate.get(record.date)?.source === "forecast";
          const daily = Number((record.gdd * unitFactor).toFixed(1));
          const normalDaily = normalDailyGddByMonthDay.get(record.date.slice(5));
          return {
            date: formatDateLabel(record.date),
            fullDate: record.date,
            dailyGddHistorical: isForecast ? undefined : daily,
            dailyGddForecast: isForecast ? daily : undefined,
            normalDaily: typeof normalDaily === "number" ? Number((normalDaily * unitFactor).toFixed(1)) : undefined,
          };
        }),
    [snapshot.records, actualEndDate, weatherByDate, unitFactor, normalDailyGddByMonthDay],
  );

  // ---- ET chart (crop water demand + precipitation supply, biofix -> forecast horizon) ----
  const etChartData = useMemo(() => {
    let cumulativeEto = 0;
    let cumulativePrecip = 0;
    // Previous day's cumulative-mean normal precip, so we can difference it into a
    // per-day normal (the climatology only ships the cumulative mean).
    let prevPrecipNormalCumRaw: number | undefined;
    // Seam date: the last observed (non-forecast) day in the window. Its value is
    // written into BOTH the observed and forecast keys so the solid and dotted
    // Recharts lines share a point and render as one continuous curve.
    const lastObservedEtDate = snapshot.records
      .filter((record) => record.date <= actualEndDate && weatherByDate.get(record.date)?.source !== "forecast")
      .at(-1)?.date;
    return snapshot.records.filter((record) => record.date <= actualEndDate).map((record) => {
      const weather = weatherByDate.get(record.date);
      const isForecast = weather?.source === "forecast";
      const onForecastLine = isForecast || record.date === lastObservedEtDate;
      const monthDay = record.date.slice(5);
      cumulativeEto += weather?.etoMm ?? 0;
      cumulativePrecip += weather?.precipMm ?? 0;
      const dailyPrecip = weather?.precipMm ?? 0;
      const etoNormal = etoNormalCumulativeByMonthDay.get(monthDay);
      const precipNormal = precipNormalCumulativeByMonthDay.get(monthDay);
      // Per-day normal precip = today's cumulative-mean minus yesterday's.
      const dailyPrecipNormalRaw =
        precipNormal != null && prevPrecipNormalCumRaw != null ? Math.max(0, precipNormal - prevPrecipNormalCumRaw) : undefined;
      if (precipNormal != null) prevPrecipNormalCumRaw = precipNormal;
      const dayStats = climatologyByMonthDay?.[monthDay];
      const comparisonEto = Object.fromEntries(
        selectedComparisonYears.map((year) => {
          const value = etoComparisonByMonthDay[year]?.get(monthDay);
          return [`year${year}Eto`, typeof value === "number" ? Number((value * etFactor).toFixed(2)) : undefined];
        }),
      );
      const cumulativeEtVal = Number((record.cumulativeEtcMm * etFactor).toFixed(2));
      const cumulativePrecipVal = Number((cumulativePrecip * etFactor).toFixed(2));
      return {
        date: formatDateLabel(record.date),
        fullDate: record.date,
        dailyEtHistorical: isForecast ? undefined : Number((record.etcMm * etFactor).toFixed(2)),
        dailyEtForecast: isForecast ? Number((record.etcMm * etFactor).toFixed(2)) : undefined,
        cumulativeEt: cumulativeEtVal,
        // The crop-ET line splits into a solid observed segment + a dotted
        // forecast segment (same color), bridged at the seam day. Precipitation
        // renders as stacked bars, so its keys are strictly exclusive — bars
        // need no shared seam point, and one would double-stack that day.
        cumulativeEtObserved: isForecast ? undefined : cumulativeEtVal,
        cumulativeEtForecast: onForecastLine ? cumulativeEtVal : undefined,
        cumulativePrecipObserved: isForecast ? undefined : cumulativePrecipVal,
        cumulativePrecipForecast: isForecast ? cumulativePrecipVal : undefined,
        // ET − precip difference = demand above supply; feeds the tooltip's
        // "demand − supply = gap" row. Zero where rain exceeds ETc.
        deficitSpan: Number(Math.max(0, cumulativeEtVal - cumulativePrecipVal).toFixed(2)),
        cumulativeEto: Number((cumulativeEto * etFactor).toFixed(2)),
        etoNormal: typeof etoNormal === "number" ? Number((etoNormal * etFactor).toFixed(2)) : undefined,
        etoNormalP10: dayStats ? Number((dayStats.etoCumP10 * etFactor).toFixed(2)) : undefined,
        etoNormalBandSpan: dayStats ? Number(((dayStats.etoCumP90 - dayStats.etoCumP10) * etFactor).toFixed(2)) : undefined,
        ...comparisonEto,
        dailyPrecipHistorical: isForecast ? undefined : Number((dailyPrecip * etFactor).toFixed(2)),
        dailyPrecipForecast: isForecast ? Number((dailyPrecip * etFactor).toFixed(2)) : undefined,
        dailyPrecipNormal: dailyPrecipNormalRaw != null ? Number((dailyPrecipNormalRaw * etFactor).toFixed(2)) : undefined,
        cumulativePrecip: cumulativePrecipVal,
        precipNormal: typeof precipNormal === "number" ? Number((precipNormal * etFactor).toFixed(2)) : undefined,
        precipNormalP10: dayStats ? Number((dayStats.precipCumP10 * etFactor).toFixed(2)) : undefined,
        precipNormalBandSpan: dayStats ? Number(((dayStats.precipCumP90 - dayStats.precipCumP10) * etFactor).toFixed(2)) : undefined,
        petLow: isForecast && typeof weather?.forecastPetP10Mm === "number" ? Number((weather.forecastPetP10Mm * etFactor).toFixed(2)) : undefined,
        petBand:
          isForecast && typeof weather?.forecastPetP10Mm === "number" && typeof weather?.forecastPetP90Mm === "number"
            ? Number(((weather.forecastPetP90Mm - weather.forecastPetP10Mm) * etFactor).toFixed(2))
            : undefined,
      };
    });
  }, [snapshot.records, weatherByDate, etFactor, actualEndDate, etoNormalCumulativeByMonthDay, precipNormalCumulativeByMonthDay, etoComparisonByMonthDay, selectedComparisonYears, climatologyByMonthDay]);

  const seasonEtoMm = snapshot.cumulativeEtoMm;
  const observedEtc = snapshot.records.filter((record) => weatherByDate.get(record.date)?.source !== "forecast").at(-1)?.cumulativeEtcMm ?? 0;
  // Crop ET expected across the selected forecast window only (clamped to the horizon).
  const forecastEndEtc = snapshot.records.filter((record) => record.date <= forecastHorizonDate).at(-1)?.cumulativeEtcMm ?? observedEtc;
  const forecastEtcMm = forecastEndEtc - observedEtc;

  // ---- Precipitation summary (mirrors the ET summary above) ----
  const observedPrecipMm = snapshot.records
    .filter((record) => record.date <= actualEndDate && weatherByDate.get(record.date)?.source !== "forecast")
    .reduce((sum, record) => sum + (weatherByDate.get(record.date)?.precipMm ?? 0), 0);
  const forecastEndPrecipMm = snapshot.records
    .filter((record) => record.date <= forecastHorizonDate)
    .reduce((sum, record) => sum + (weatherByDate.get(record.date)?.precipMm ?? 0), 0);
  const forecastPrecipMm = forecastEndPrecipMm - observedPrecipMm;
  const normalPrecipToDateMm = precipNormalCumulativeByMonthDay.get(todayIso.slice(5));

  // ---- Active chart selection ----
  const gddView = view === "gdd" && gddChartMode === "daily" ? gddDailyChartData : gddChartData;
  // Chill chart rows: the precomputed series carries the observed cumulative
  // line plus the Oct1-anchored normal band (drawn with the stacked P10-base +
  // span technique used by the ET/precip bands); the fallback carries only the
  // client Dynamic Model's observed line.
  const chillChartData = useMemo(() => {
    if (chillModel === "hours") {
      return chillHoursSeries.map((record) => ({
        date: formatDateLabel(record.date),
        fullDate: record.date,
        daily: record.chillHours as number | undefined,
        current: record.cumulativeChillHours as number | undefined,
      }));
    }
    if (chillUsesPrecomputed && chillPrecomputed) {
      return chillPrecomputed.days.map((day) => ({
        date: formatDateLabel(day.date),
        fullDate: day.date,
        daily: day.dailyPortions ?? undefined,
        current: day.cumulativePortions ?? undefined,
        chillNormalP10: day.bandP10 ?? undefined,
        chillNormalBandSpan:
          day.bandP10 != null && day.bandP90 != null ? Number((day.bandP90 - day.bandP10).toFixed(2)) : undefined,
        chillNormalP50: day.bandP50 ?? undefined,
      }));
    }
    return chillSeriesData(chillFallback);
  }, [chillModel, chillHoursSeries, chillUsesPrecomputed, chillPrecomputed, chillFallback]);

  const chartData = view === "et" ? etChartData : view === "chill" ? chillChartData : gddView;

  function chillSeriesData(series: ReturnType<typeof cumulativeChillPortions>) {
    return series.map((record) => ({
      date: formatDateLabel(record.date),
      fullDate: record.date,
      daily: record.dailyPortions as number | undefined,
      current: record.cumulativePortions as number | undefined,
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
    return `${formatEtNumber(valueMm)} ${etLabel}`;
  }

  // Bare number (no unit label) for composing expressions like "22.4 − 13.1 in".
  function formatEtNumber(valueMm: number): string {
    return (valueMm * etFactor).toFixed(etUnit === "in" ? 1 : 0);
  }

  function formatStageDate(projection: { status: string; date?: string } | undefined): string {
    if (!projection?.date) return "--";
    const label = formatDateLabel(projection.date);
    return projection.status === "projected" ? `~${label}` : label;
  }

  function handleExportCsv() {
    const chillByDate =
      chillModel === "hours"
        ? new Map(chillHoursSeries.map((record) => [record.date, record.cumulativeChillHours]))
        : chillUsesPrecomputed && chillPrecomputed
          ? new Map(
              chillPrecomputed.days
                .filter((day) => day.cumulativePortions !== null)
                .map((day) => [day.date, day.cumulativePortions as number]),
            )
          : new Map(chillFallback.map((record) => [record.date, record.cumulativePortions]));
    const tempSuffix = tempUnitSuffix(unitSystem);
    const columns = [
      { key: "date", label: "Date" },
      { key: "source", label: "Source" },
      { key: "tmin", label: `Tmin (${tempSuffix})` },
      { key: "tmax", label: `Tmax (${tempSuffix})` },
      { key: "dailyGdd", label: `Daily ${unitLabel}` },
      { key: "cumulativeGdd", label: `Cumulative ${unitLabel}` },
      { key: "normalGdd", label: `30-yr Normal Cumulative ${unitLabel}` },
      { key: "etcMm", label: `Crop ET (${etLabel})` },
      { key: "etoMm", label: `Reference ETo (${etLabel})` },
      { key: "etoNormal", label: `30-yr Normal Cumulative Reference ETo (${etLabel})` },
      { key: "precip", label: `Precipitation (${etLabel})` },
      { key: "cumulativePrecip", label: `Cumulative Precipitation (${etLabel})` },
      ...selectedComparisonYears.map((year) => ({ key: `year${year}`, label: `${year} Cumulative ${unitLabel}` })),
      ...selectedComparisonYears.map((year) => ({ key: `year${year}Eto`, label: `${year} Cumulative Reference ETo (${etLabel})` })),
      ...(cropMetrics.chill.enabled ? [{ key: "chill", label: chillModel === "hours" ? "Cumulative Chill Hours" : "Cumulative Chill Portions" }] : []),
    ];

    let cumulativePrecipMm = 0;
    const rows = snapshot.records.map((record) => {
      const monthDay = record.date.slice(5);
      const weather = weatherByDate.get(record.date);
      const normal = normalCumulativeByMonthDay.get(monthDay);
      const etoNormal = etoNormalCumulativeByMonthDay.get(monthDay);
      cumulativePrecipMm += weather?.precipMm ?? 0;
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
        precip: typeof weather?.precipMm === "number" ? Number((weather.precipMm * etFactor).toFixed(2)) : undefined,
        cumulativePrecip: Number((cumulativePrecipMm * etFactor).toFixed(2)),
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

    downloadCsv(`${fileSlug}-${view}-${todayIso}.csv`, columns, rows);
  }

  // Renders the graph card (title + chart + legend) to a PNG. The interactive
  // controls are excluded via the filter so the image is presentation-ready.
  async function handleExportImage() {
    const node = chartPanelRef.current;
    if (!node) return;
    setExportingImage(true);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        filter: (el) =>
          !(el instanceof HTMLElement) ||
          !(el.classList.contains("segmented") || el.classList.contains("inline-controls") || el.classList.contains("legend-info")),
      });
      const link = document.createElement("a");
      link.download = `${fileSlug}-${view}-${todayIso}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExportingImage(false);
    }
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
  if (view === "gdd" && gddChartMode === "daily") {
    legendItems.push({
      label: "Daily GDD",
      color: GDD_CURRENT_COLOR,
      source: "Growing degree days accumulated each day from gridMET daily min/max air temperature.",
    });
    if (forecastVisible)
      legendItems.push({
        label: "Daily GDD (forecast)",
        color: "#eb6834",
        source: "Daily GDD projected from the Climate Toolbox CFS forecast across the selected window.",
      });
    if (show.climatologyNormal)
      legendItems.push({
        label: "Historical (30 year average, daily)",
        color: GDD_NORMAL_COLOR,
        dashed: true,
        source: "Average daily GDD on each calendar day across the previous 30 seasons of gridMET temperatures.",
      });
  } else if (view === "gdd") {
    if (show.currentSeason)
      legendItems.push({
        label: "Current Year (observed)",
        color: GDD_CURRENT_COLOR,
        source:
          "Growing degree days accumulated from gridMET daily min/max air temperature, using the averaging method capped at the crop's base and upper thresholds.",
      });
    if (show.projection || forecastVisible)
      legendItems.push({
        label: "Forecast",
        color: GDD_CURRENT_COLOR,
        dashed: true,
        source:
          "Dashed continuation of the season line from the last observed day: Climate Toolbox CFS forecast GDD through the selected window, extended at the 30-year average daily accumulation rate where the forecast runs out.",
      });
    if (show.climatologyNormal)
      legendItems.push({
        label: "Historical (30 year average)",
        color: GDD_NORMAL_COLOR,
        dashed: true,
        source: "Average cumulative GDD on each calendar day across the previous 30 seasons of gridMET temperatures.",
      });
    if (show.climatologyBand)
      legendItems.push({
        label: "30-yr P10–P90 band",
        color: GDD_NORMAL_BAND_COLOR,
        source: "The middle 80% of cumulative-GDD outcomes across the previous 30 seasons, with the median (P50) as a fine dotted line — context for how unusual this season is.",
      });
    if (show.selectedYears)
      selectedComparisonYears.forEach((year, index) =>
        legendItems.push({
          label: `${year}`,
          color: comparisonYearColor(index),
          source: `Cumulative GDD for the ${year} season from gridMET historical temperatures.`,
        }),
      );
  } else if (view === "chill") {
    legendItems.push({
      label: "Current Chill",
      color: GDD_CURRENT_COLOR,
      source:
        chillModel === "hours"
          ? "Cumulative Chill Hours: hours spent inside the threshold band each day (from hourly temperatures, or a sinusoidal min/max approximation) this dormant season."
          : chillUsesPrecomputed
            ? "Cumulative Chill Portions (Dynamic Model, Fishman–Erez) precomputed by the Climate Toolbox from gridMET, accumulated from Oct 1."
            : "Cumulative Chill Portions from the Dynamic Model (Fishman–Erez), computed on hourly temperatures this dormant season.",
    });
    if (chillShowBand)
      legendItems.push({
        label: `Normal P10–P90 band (${chillPrecomputed?.baselineLabel})`,
        color: CHILL_NORMAL_COLOR,
        source: `The middle 80% of cumulative chill-portion outcomes across the ${chillPrecomputed?.baselineLabel} baseline, with the median (P50) as a fine dotted line — context for how this dormant season compares.`,
      });
    if (chillModel === "portions" && chillRequirement) legendItems.push({ label: "Chill Target", color: "#4a7c59", dashed: true });
  } else {
    // ET view: dual-axis chart — cumulative crop-ET demand (line, left axis) vs
    // daily precipitation supply (bars, right axis). Hover surfaces the deficit.
    legendItems.push({
      label: "Crop ET (demand, cumulative)",
      color: CROP_ET_COLOR,
      source:
        "Cumulative crop ET (ETc) on the left axis: reference ETo × the crop coefficient (Kc) for the current growth stage — the water the crop uses.",
    });
    legendItems.push({
      label: "Precipitation (daily)",
      color: PRECIP_NORMAL_COLOR,
      source: "Daily precipitation bars from gridMET daily totals on the right axis, extended with the Climate Toolbox CFS forecast (lighter bars) — the rain that fell on the field each day.",
    });
    if (show.precipNormal)
      legendItems.push({
        label: "Precipitation — Historical (30-yr daily avg)",
        color: PRECIP_HISTORICAL_COLOR,
        source: "Average daily precipitation on each calendar day across the previous 30 seasons of gridMET history, drawn as bars beside this season's — the “normal” daily rain for this field.",
      });
    if (show.etReferenceNormal)
      legendItems.push({
        label: "Reference ETo — 30-yr normal",
        color: ETO_NORMAL_COLOR,
        dashed: true,
        source: "Average cumulative reference ETo on each calendar day across the previous 30 seasons of gridMET history — opt-in context from Advanced settings.",
      });
    if (show.etReferencePriorYear && selectedComparisonYears.length)
      legendItems.push({
        label: `Reference ETo — ${selectedComparisonYears.join(", ")}`,
        color: etoComparisonYearColor(0),
        source: "Cumulative reference ETo for the selected comparison years — opt-in context from Advanced settings.",
      });
    if (show.etDailyBars)
      legendItems.push({
        label: "Crop ET (daily)",
        color: CROP_ET_COLOR,
        source: "Daily crop-ET bars (right axis) beside the precipitation bars — opt-in from Advanced settings.",
      });
    if (forecastVisible)
      legendItems.push({
        label: "Forecast (current-year)",
        color: "#687078",
        dashed: true,
        source: "Past the last observed day, the crop-ET line turns dotted and this season's precipitation bars lighten, across the Climate Toolbox CFS forecast window.",
      });
  }

  const renderStageLabels = (rcProps: {
    width?: number;
    yAxisMap?: Record<string, { scale: (value: number) => number }>;
    offset?: { top: number; left: number; width: number; height: number };
  }) => <StageLabelsOverlay items={overlayLabelItems} width={rcProps.width} yAxisMap={rcProps.yAxisMap} offset={rcProps.offset} />;

  const viewSubtitle =
    view === "gdd"
      ? gddChartMode === "daily"
        ? `${cropDisplayName} daily GDD accumulation this season, with the 30-yr average`
        : `${cropDisplayName} cumulative GDD across ${currentYear}, with last year and the 30-yr normal`
      : view === "chill"
        ? chillModel === "hours"
          ? `${cropDisplayName} cumulative chill hours this dormant season, counted inside the ${celsiusToDisplayTemp(settings.chillThresholdMinC, unitSystem)}–${celsiusToDisplayTemp(settings.chillThresholdMaxC, unitSystem)}°${tempUnitSuffix(unitSystem)} band`
          : `${cropDisplayName} cumulative chill portions this dormant season${chillShowBand ? `, with the ${chillPrecomputed?.baselineLabel} normal band` : ""}`
        : `${cropDisplayName} water balance this season — cumulative crop demand (ETc, left axis) vs daily precipitation (bars, right axis); hover any day for the ET − precipitation difference`;

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
            label: "30-yr Average",
            value: typeof normalToDateC === "number" ? `${formatGdd(normalToDateC)} ${unitLabel}` : "Pending",
            detail: "Average to date",
            icon: Gauge,
            info: "Average cumulative GDD on today's date across the prior 30 seasons.",
          },
          {
            label: "Difference",
            value: typeof gddVsNormalC === "number" ? `${gddVsNormalC >= 0 ? "+" : "-"}${formatGdd(Math.abs(gddVsNormalC))} ${unitLabel}` : "Pending",
            detail: typeof daysVsNormal === "number" ? `${Math.abs(daysVsNormal)} days ${daysVsNormal >= 0 ? "ahead" : "behind"}` : "vs 30-yr average",
            icon: CalendarClock,
            info: "Current-season GDD minus the 30-yr average for today, with the equivalent days ahead or behind.",
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
              value:
                chillModel === "hours"
                  ? chillWeatherRecords.length
                    ? `${Math.round(currentChillHours).toLocaleString()} hrs`
                    : "Pending"
                  : chillUsesPrecomputed || chillWeatherRecords.length
                    ? `${currentChillPortions.toFixed(1)} CP`
                    : "Pending",
              detail: chillAccrualStart ? `Since ${formatDateLabel(chillAccrualStart)}` : "Dormant season",
              icon: ThermometerSun,
              info:
                chillModel === "hours"
                  ? "Cumulative Chill Hours: hours per day spent inside the crop's threshold band, from hourly temperatures (or a sinusoidal min/max approximation) this dormant season."
                  : chillUsesPrecomputed
                    ? `Cumulative Chill Portions (Dynamic Model, Fishman–Erez) precomputed by the Climate Toolbox and accumulated from Oct 1. Normal band baseline ${chillPrecomputed?.baselineLabel}.`
                    : "Cumulative Chill Portions from the Dynamic Model (Fishman–Erez), computed on hourly temperatures this dormant season.",
            },
            {
              label: "Requirement",
              value: chillModel === "portions" && chillRequirement ? `${chillRequirement.toLocaleString()} CP` : "n/a",
              detail: chillModel === "portions" ? "Crop chill need" : "Defined in Chill Portions",
              icon: Gauge,
              info:
                chillModel === "portions"
                  ? "Approximate Chill Portion requirement for this crop profile."
                  : "This crop's chill requirement is recorded in Chill Portions; switch to the Chill Portions model to track it.",
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
              label: "Crop ET (demand)",
              value: seasonQuery.hasDetails && snapshot.records.length ? formatEt(observedEtc) : "Pending",
              detail: "Water used to date",
              icon: Droplets,
              info: "Cumulative crop ET (ETc) to date — reference ETo × the crop coefficient (Kc).",
            },
            {
              label: "Precip (supply)",
              value: seasonQuery.hasDetails && snapshot.records.length ? formatEt(observedPrecipMm) : "Pending",
              detail: "Rain supplied to date",
              icon: Gauge,
              info: "Cumulative precipitation to date, accumulated from gridMET daily totals over the season window.",
            },
            {
              // "Difference", not "deficit": without knowing what was irrigated we
              // only know demand minus rain, not how far behind the field actually is.
              label: "Difference (ET − precip)",
              // Shown as the subtraction it is (demand − supply), with the
              // resulting gap in the detail line.
              value: seasonQuery.hasDetails && snapshot.records.length
                ? `${formatEtNumber(observedEtc)} − ${formatEtNumber(observedPrecipMm)} ${etLabel}`
                : "Pending",
              detail: seasonQuery.hasDetails && snapshot.records.length
                ? `= ${observedEtc - observedPrecipMm >= 0 ? "" : "−"}${formatEt(Math.abs(observedEtc - observedPrecipMm))} ${
                    observedEtc - observedPrecipMm >= 0 ? "demand above rainfall" : "rain above demand"
                  }`
                : "Demand minus rainfall",
              icon: Sprout,
              info: "Crop demand (ETc) minus precipitation supply to date — the theoretical amount to cover through irrigation, since actual irrigation applied is unknown here. A negative value means rain has exceeded demand.",
            },
          ];

  const chartLoading =
    primaryWeatherLoading ||
    (view === "et" && seasonQuery.isBackgroundFetching && !seasonQuery.hasDetails) ||
    (view === "chill" && !chartData.length && (chillQuery.isFetching || chillClimatology.isFetching));
  const chartReady = !chartLoading && chartData.length > 0;

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <div className="heading-row">
            <h1>Growing Season Insights</h1>
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
          <button className="primary-button" type="button" onClick={handleExportImage} disabled={!chartData.length || exportingImage}>
            <ImageIcon size={18} />
            {exportingImage ? "Exporting…" : "Export Image"}
          </button>
        </div>
      </div>

      <section className="metrics-grid">
        {metricCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} detail={card.detail} icon={card.icon} tone="success" info={card.info} />
        ))}
      </section>

      <section className="dashboard-grid">
        <section className="panel chart-panel" ref={chartPanelRef}>
          <div className="panel-title-row">
            <div>
              <h2>{field.name} — {field.cropLabel}</h2>
              <p className="chart-location">{formatLatLon(field.lat, field.lon)}</p>
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
            gddChartMode={gddChartMode}
            chillModel={chillModel}
            onChillModelChange={setChillModel}
            onGddChartModeChange={setGddChartMode}
            onOpenAdvanced={() => setAdvancedOpen(true)}
          />

          <div className="chart-wrap">
            {chartReady ? (
              <ResponsiveContainer width="100%" height="100%">
                {view === "et" ? (
                  <ComposedChart data={etChartData} margin={{ top: 28, right: 8, bottom: 16, left: 12 }}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} height={42} />
                    {/* Dual scale: cumulative crop-ET demand (~1000s of mm) on the LEFT; daily
                        precipitation (a few mm/day) as bars on the RIGHT, so the small rain values
                        aren't flattened under the ET line. */}
                    <YAxis
                      yAxisId="cumulative"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickMargin={8}
                      tick={{ fontSize: 12 }}
                      label={{
                        value: `Crop ET (${etLabel})`,
                        angle: -90,
                        position: "insideLeft",
                        offset: 2,
                        dy: 34,
                        fill: CROP_ET_COLOR,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    />
                    <YAxis
                      yAxisId="precip"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickMargin={8}
                      tick={{ fontSize: 12 }}
                      // Top of the scale is ~2× the wettest day, so even the tallest
                      // rain bar stays in the lower half and never dominates the ET line.
                      domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 2) : 1)]}
                      label={{
                        value: `Daily precip (${etLabel})`,
                        angle: -90,
                        position: "insideRight",
                        offset: 2,
                        dy: 34,
                        fill: PRECIP_NORMAL_COLOR,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    />
                    <Tooltip
                      separator=" "
                      contentStyle={{ background: "#ffffff", border: "1px solid #9fa89d", borderRadius: 3, color: "#061827", fontWeight: 800 }}
                      formatter={(value, name, entry: any) => {
                        const labels: Record<string, string> = {
                          cumulativeEtObserved: "Crop ET (demand, cumulative)",
                          cumulativeEtForecast: "Crop ET (forecast, cumulative)",
                          dailyPrecipHistorical: "Precipitation (daily)",
                          dailyPrecipForecast: "Precipitation (daily, forecast)",
                          dailyPrecipNormal: "Precipitation — Historical (30-yr daily avg)",
                          deficitSpan: "Difference, ET − precip (to date)",
                          etoNormal: "Reference ETo — 30-yr normal (cumulative)",
                          dailyEtHistorical: "Crop ET (daily)",
                          dailyEtForecast: "Crop ET (daily, forecast)",
                        };
                        // Comparison-year reference-ETo keys are dynamic ("year2024Eto", …).
                        const comparisonYearMatch = String(name).match(/^year(\d{4})Eto$/);
                        if (comparisonYearMatch) return [`${Number(value).toFixed(2)} ${etLabel}`, `Reference ETo — ${comparisonYearMatch[1]} (cumulative)`];
                        // Seam day: the crop-ET line writes both observed and forecast keys; drop
                        // the duplicate forecast row so it isn't listed twice.
                        if (name === "cumulativeEtForecast" && entry?.payload?.cumulativeEtObserved != null)
                          return ["", ""] as [string, string];
                        // Deficit reads as the subtraction it is: demand − supply = gap.
                        if (name === "deficitSpan") {
                          const et = entry?.payload?.cumulativeEt;
                          const precip = entry?.payload?.cumulativePrecip;
                          if (et == null || precip == null || et <= precip) return ["", ""] as [string, string];
                          return [
                            `${Number(et).toFixed(2)} − ${Number(precip).toFixed(2)} = ${Number(et - precip).toFixed(2)} ${etLabel}`,
                            labels.deficitSpan,
                          ];
                        }
                        return [`${Number(value).toFixed(2)} ${etLabel}`, labels[String(name)] ?? String(name)];
                      }}
                      labelFormatter={(label) => etChartData.find((point) => point.date === label)?.fullDate ?? label}
                    />
                    {/* Invisible zero-opacity series: exists only so the tooltip can surface the
                        running "demand − supply = gap" deficit — no visible mark of its own. */}
                    <Area yAxisId="cumulative" type="monotone" dataKey="deficitSpan" stroke="none" fill={WATER_DEFICIT_COLOR} fillOpacity={0} activeDot={false} connectNulls />
                    {/* Supply: this season's daily precipitation bars (bright blue) — observed
                        solid, forecast lighter. Shared stackId + exclusive keys = one bar per day.
                        minPointSize keeps trace-rain days visible (2px stub) without drawing
                        stubs on dry (zero) days. */}
                    <Bar yAxisId="precip" dataKey="dailyPrecipHistorical" stackId="rainThisYear" fill={PRECIP_NORMAL_COLOR} barSize={4} minPointSize={visibleRainStub} />
                    <Bar yAxisId="precip" dataKey="dailyPrecipForecast" stackId="rainThisYear" fill={PRECIP_NORMAL_COLOR} fillOpacity={0.5} barSize={4} minPointSize={visibleRainStub} />
                    {/* Historical (30-yr) daily-average precipitation bars (aqua), grouped beside this season's. */}
                    {show.precipNormal ? (
                      <Bar yAxisId="precip" dataKey="dailyPrecipNormal" fill={PRECIP_HISTORICAL_COLOR} fillOpacity={0.8} barSize={4} minPointSize={visibleRainStub} />
                    ) : null}
                    {/* Opt-in reference-ETo overlays (Advanced, default off): the chart reads
                        as crop ET only unless the user asks for the reference context. */}
                    {show.etReferenceNormal ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="etoNormal" stroke={ETO_NORMAL_COLOR} strokeDasharray="5 4" dot={false} strokeWidth={1.6} strokeOpacity={0.9} connectNulls />
                    ) : null}
                    {show.etReferencePriorYear
                      ? selectedComparisonYears.map((year, index) => (
                          <Line
                            key={`year${year}Eto`}
                            yAxisId="cumulative"
                            type="monotone"
                            dataKey={`year${year}Eto`}
                            stroke={etoComparisonYearColor(index)}
                            dot={false}
                            strokeWidth={1.6}
                            strokeOpacity={0.9}
                            connectNulls
                          />
                        ))
                      : null}
                    {/* Opt-in daily crop-ET bars share the right (daily) axis with precipitation. */}
                    {show.etDailyBars ? (
                      <>
                        <Bar yAxisId="precip" dataKey="dailyEtHistorical" stackId="dailyEt" fill={CROP_ET_COLOR} fillOpacity={0.45} barSize={4} />
                        <Bar yAxisId="precip" dataKey="dailyEtForecast" stackId="dailyEt" fill={CROP_ET_COLOR} fillOpacity={0.25} barSize={4} />
                      </>
                    ) : null}
                    {/* Demand: cumulative crop ET / ETc (bold red) — observed solid, forecast dotted (same color). */}
                    <Line yAxisId="cumulative" type="monotone" dataKey="cumulativeEtObserved" stroke={CROP_ET_COLOR} dot={false} strokeWidth={3} connectNulls />
                    <Line yAxisId="cumulative" type="monotone" dataKey="cumulativeEtForecast" stroke={CROP_ET_COLOR} strokeDasharray="2 4" dot={false} strokeWidth={3} strokeOpacity={0.95} connectNulls />
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
                ) : view === "gdd" && gddChartMode === "daily" ? (
                  <ComposedChart data={gddDailyChartData} margin={{ top: 28, right: 24, bottom: 16, left: 12 }}>
                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11 }} height={42} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickMargin={8}
                      tick={{ fontSize: 12 }}
                      label={{
                        value: `Daily ${unitLabel}`,
                        angle: -90,
                        position: "insideLeft",
                        offset: 2,
                        dy: 40,
                        fill: "#687078",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    />
                    <Tooltip
                      separator=" "
                      cursor={{ fill: "rgba(74, 124, 89, 0.18)" }}
                      contentStyle={{ background: "#ffffff", border: "1px solid #9fa89d", borderRadius: 3, color: "#061827", fontWeight: 800 }}
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          dailyGddHistorical: "Daily GDD",
                          dailyGddForecast: "Daily GDD (forecast)",
                          normalDaily: "Daily 30-year average",
                        };
                        return [`${Number(value).toFixed(1)} ${unitLabel}`, labels[String(name)] ?? String(name)];
                      }}
                      labelFormatter={(label) => gddDailyChartData.find((point) => point.date === label)?.fullDate ?? label}
                    />
                    <Bar dataKey="dailyGddHistorical" fill={GDD_CURRENT_COLOR} barSize={4} />
                    {forecastVisible ? <Bar dataKey="dailyGddForecast" fill="#eb6834" barSize={4} /> : null}
                    {show.climatologyNormal ? (
                      <Line type="monotone" dataKey="normalDaily" stroke={GDD_NORMAL_COLOR} strokeDasharray="7 4" dot={false} strokeWidth={2} strokeOpacity={0.95} connectNulls />
                    ) : null}
                    <ReferenceLine x={todayLabel} stroke="#687078" strokeDasharray="2 4" strokeOpacity={0.7} />
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
                        value: view === "gdd" ? `Cumulative ${unitLabel}` : "Cumulative Chill Portions",
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
                      separator=" "
                      cursor={{ fill: "rgba(74, 124, 89, 0.18)", stroke: "#2f6f3a", strokeWidth: 1.5 }}
                      contentStyle={{ background: "#ffffff", border: "1px solid #9fa89d", borderRadius: 3, color: "#061827", fontWeight: 800 }}
                      formatter={(value, name, entry: any) => {
                        const labels: Record<string, string> = {
                          current: view === "gdd" ? "Current season (to date)" : "Accumulated chill (to date)",
                          projected: "Forecast",
                          normal: "30-year average",
                          normalP50: "30-year median (50th percentile)",
                          chillNormalP50: "30-year median (50th percentile)",
                          normalRange: "30-year range (10th–90th percentile)",
                          chillNormalP10: "30-year range (10th–90th percentile)",
                        };
                        comparisonYears.forEach((year) => {
                          labels[`year${year}`] = `${year} season`;
                        });
                        // Surface the shaded band as one "low – high" range row.
                        if (name === "normalRange") {
                          const [low, high] = Array.isArray(value) ? value : [undefined, undefined];
                          if (low == null || high == null) return ["", ""] as [string, string];
                          return [`${Number(low).toFixed(1)} – ${Number(high).toFixed(1)}`, labels.normalRange];
                        }
                        if (name === "chillNormalP10") {
                          const p10 = entry?.payload?.chillNormalP10;
                          const span = entry?.payload?.chillNormalBandSpan;
                          if (p10 == null || span == null) return ["", ""] as [string, string];
                          return [`${Number(p10).toFixed(1)} – ${Number(p10 + span).toFixed(1)}`, labels.chillNormalP10];
                        }
                        if (name === "chillNormalBandSpan") return ["", ""] as [string, string];
                        return [`${Number(value).toFixed(1)}`, labels[String(name)] ?? String(name)];
                      }}
                      labelFormatter={(label) => chartData.find((point) => point.date === label)?.fullDate ?? label}
                    />
                    {view === "chill" && chillShowBand ? (
                      <>
                        <Area yAxisId="cumulative" type="monotone" dataKey="chillNormalP10" stackId="chillNormalBand" stroke="none" fill="none" connectNulls />
                        <Area yAxisId="cumulative" type="monotone" dataKey="chillNormalBandSpan" stackId="chillNormalBand" stroke="none" fill={CHILL_NORMAL_COLOR} fillOpacity={0.14} connectNulls />
                      </>
                    ) : null}
                    {view === "chill" && chillShowBand ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="chillNormalP50" stroke={CHILL_NORMAL_COLOR} strokeDasharray="2 4" dot={false} strokeWidth={1.3} strokeOpacity={0.7} connectNulls />
                    ) : null}
                    {view === "gdd" && show.climatologyBand ? (
                      <Area yAxisId="cumulative" type="monotone" dataKey="normalRange" stroke="none" fill={GDD_NORMAL_BAND_COLOR} fillOpacity={0.55} isAnimationActive={false} connectNulls />
                    ) : null}
                    {view === "gdd" && show.climatologyBand ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="normalP50" stroke={GDD_NORMAL_COLOR} strokeDasharray="2 4" dot={false} strokeWidth={1.3} strokeOpacity={0.6} connectNulls />
                    ) : null}
                    {view === "gdd" && show.climatologyNormal ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="normal" stroke={GDD_NORMAL_COLOR} strokeDasharray="7 4" dot={false} strokeWidth={2} />
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
                    {view === "gdd" ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="projected" stroke={GDD_CURRENT_COLOR} strokeDasharray="5 5" dot={false} strokeWidth={3} connectNulls />
                    ) : null}
                    {(view === "gdd" ? show.currentSeason : true) ? (
                      <Line yAxisId="cumulative" type="monotone" dataKey="current" stroke={GDD_CURRENT_COLOR} dot={show.dataMarkers} strokeWidth={3} connectNulls />
                    ) : null}
                    {view === "gdd" ? <ReferenceLine yAxisId="cumulative" x={todayLabel} stroke="#687078" strokeDasharray="2 4" strokeOpacity={0.7} /> : null}
                    {view === "chill" && chillModel === "portions" && chillRequirement ? (
                      <ReferenceLine
                        yAxisId="cumulative"
                        y={chillRequirement}
                        stroke="#4a7c59"
                        strokeDasharray="3 5"
                        strokeOpacity={0.75}
                        label={(props) => <StageReferenceLabel {...props} value="Chill target" detail={`${chillRequirement.toLocaleString()} CP`} dy={-8} />}
                      />
                    ) : null}
                    {overlayLabelItems.length ? <Customized component={renderStageLabels} /> : null}
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            ) : null}
            <ChartLoader active={chartLoading} label={primaryWeatherLoading ? "Loading GDD data" : `Loading ${view} data`} />
            {!chartLoading && !chartData.length ? <div className="chart-empty">No weather records loaded for this field and date range.</div> : null}
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
            {chartReady && overlaysLoading && (view === "gdd" || view === "et") ? (
              <span className="legend-item legend-loading" role="status" aria-live="polite">
                <LoaderCircle size={13} aria-hidden="true" />
                Loading comparison data
              </span>
            ) : null}
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
              Projected dates use the 28-day forecast, then extend along the average accumulation of the past 30 seasons. Prior-year dates apply the same
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
