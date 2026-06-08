import { CalendarDays, Download, Droplets, LoaderCircle, Snowflake, ThermometerSun } from "lucide-react";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { climateToolboxApi, climateToolboxProvider } from "../api/climate";
import type { EtDataResponse } from "../api/contracts";
import { getSupportedOpenEtDateRange, openEtApi, openEtProvider, type OpenEtLoadEvent } from "../api/openEt";
import { buildAnalyticsSnapshot } from "../calcs/analytics";
import { cropProfiles } from "../data/crops";
import { mockWeatherRecords } from "../data/weather";
import type { FieldConfig, WeatherRecord } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { addUtcDays, getRollingDateRange, toIsoDate } from "../utils/dateRange";
import { MetricCard } from "./MetricCard";
import { useEffect, useMemo, useState } from "react";

interface DashboardProps {
  field: FieldConfig;
}

type EtChartMode = "daily" | "cumulative";
type EtRecord = EtDataResponse["records"][number];
type LoadFlag = "idle" | "checking" | "fetching" | "saving" | "loaded" | "hit" | "miss" | "disabled" | "error";

interface EtLoadFlags {
  pocketBaseEtData: LoadFlag;
  openEtApi: LoadFlag;
  pocketBaseEtSave: LoadFlag;
  climateToolboxWeather: LoadFlag;
}

function inches(mm: number): string {
  return `${(mm / 25.4).toFixed(1)}"`;
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

function currentYearStartDate(): string {
  const now = new Date();
  return toIsoDate(new Date(Date.UTC(now.getFullYear(), 0, 1)));
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

function buildMockHistoricalEtRecords(): EtRecord[] {
  return mockWeatherRecords.map((record) => ({
    date: record.date,
    etoMm: record.etoMm,
    etActualMm: Number((record.etoMm * 0.92).toFixed(1)),
    etReferenceMm: record.etoMm,
    precipMm: record.precipMm,
    source: "historical",
  }));
}

function buildEtDataSourceLabel(records: EtRecord[], usingMockHistorical: boolean): string {
  if (usingMockHistorical) return "Mock historical ET";

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

function dayDistance(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function Dashboard({ field }: DashboardProps) {
  const endDate = useMemo(() => getRollingDateRange(1).endDate, []);
  const dateRange = useMemo(
    () => ({
      startDate: field.stageStartDate || currentYearStartDate(),
      endDate,
    }),
    [endDate, field.stageStartDate],
  );
  const [weatherRecords, setWeatherRecords] = useState<WeatherRecord[]>([]);
  const [etRecords, setEtRecords] = useState<EtRecord[]>([]);
  const [etLoading, setEtLoading] = useState(openEtApi.enabled || climateToolboxApi.enabled);
  const [loadFlags, setLoadFlags] = useState<EtLoadFlags>({
    pocketBaseEtData: openEtApi.enabled ? "idle" : "disabled",
    openEtApi: openEtApi.enabled ? "idle" : "disabled",
    pocketBaseEtSave: openEtApi.enabled ? "idle" : "disabled",
    climateToolboxWeather: climateToolboxApi.enabled ? "idle" : "disabled",
  });
  const [dataSourceLabel, setDataSourceLabel] = useState(openEtApi.enabled || climateToolboxApi.enabled ? "Loading ET data" : "ET sources disabled");
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [etChartMode, setEtChartMode] = useState<EtChartMode>("cumulative");
  const crop = cropProfiles[field.cropId];

  useEffect(() => {
    let ignore = false;

    async function loadEtData() {
      if (!openEtApi.enabled && !climateToolboxApi.enabled) {
        setEtRecords([]);
        setEtLoading(false);
        setLoadFlags({
          pocketBaseEtData: "disabled",
          openEtApi: "disabled",
          pocketBaseEtSave: "disabled",
          climateToolboxWeather: "disabled",
        });
        setDataSourceLabel("ET sources disabled");
        setDataWarning("OpenET and Climate Toolbox are disabled. No ET data will be displayed.");
        return;
      }

      const nextRecords: EtRecord[] = [];
      const warnings: string[] = [];

      setEtRecords([]);
      setWeatherRecords([]);
      setEtLoading(true);
      setDataSourceLabel("Loading ET data");
      setLoadFlags({
        pocketBaseEtData: openEtApi.enabled ? "checking" : "disabled",
        openEtApi: openEtApi.enabled ? "idle" : "disabled",
        pocketBaseEtSave: openEtApi.enabled ? "idle" : "disabled",
        climateToolboxWeather: climateToolboxApi.enabled ? "fetching" : "disabled",
      });

      if (openEtApi.enabled) {
        try {
          const openEtDateRange = getSupportedOpenEtDateRange({
            cropId: field.cropId,
            lat: field.lat,
            lon: field.lon,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
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
            startDate: dateRange.endDate,
            endDate: toIsoDate(addUtcDays(new Date(`${dateRange.endDate}T00:00:00Z`), 28)),
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
          setWeatherRecords(forecastRecords);
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
      const hasLiveHistorical = liveRecords.some((record) => record.source !== "forecast");
      const mergedRecords = hasLiveHistorical ? liveRecords : mergeEtRecords([...buildMockHistoricalEtRecords(), ...liveRecords.filter((record) => record.source === "forecast")]);
      const usingMockHistorical = !hasLiveHistorical;
      setEtRecords(mergedRecords);
      setEtLoading(false);
      setDataSourceLabel(buildEtDataSourceLabel(mergedRecords, usingMockHistorical));
      setDataWarning(
        usingMockHistorical
          ? `Live historical ET is unavailable. Showing mock past-30-day ET data.${warnings.length ? ` ${warnings.join(" ")}` : ""}`
          : warnings.length
            ? warnings.join(" ")
            : null,
      );
    }

    void loadEtData();

    return () => {
      ignore = true;
    };
  }, [dateRange.endDate, dateRange.startDate, field.cropId, field.id, field.lat, field.lon]);

  const snapshot = useMemo(() => buildAnalyticsSnapshot(field, crop, weatherRecords, []), [crop, field, weatherRecords]);
  const latest = snapshot.records.at(-1);
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
          days: dayDistance(dateRange.endDate, record.date),
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
  const labelStep = Math.max(1, Math.ceil(chartData.length / 8));
  const chartTicks = chartData.filter((_, index) => index % labelStep === 0 || index === chartData.length - 1).map((point) => point.date);
  const chartLabel = etChartMode === "daily" ? "Daily ET (in/day)" : "Cumulative ET (in)";
  const isEtChartLoading = etLoading && !chartData.length;
  const displayEndDate = toIsoDate(addUtcDays(new Date(`${dateRange.endDate}T00:00:00Z`), climateToolboxApi.enabled ? 28 : 0));
  const chillPercent =
    snapshot.chillPortions && snapshot.chillRequirement
      ? Math.min(100, Math.round((snapshot.chillPortions / snapshot.chillRequirement) * 100))
      : undefined;

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
          label="ET Accumulation"
          value={historicalEtRecords.length ? inches(cumulativeActualEtMm || cumulativeReferenceEtMm) : "Pending"}
          detail={historicalEtRecords.length ? `${inches(cumulativeReferenceEtMm)} reference ETo` : etLoading ? "Loading OpenET/PocketBase ET data" : "No OpenET data loaded"}
          badge={historicalEtRecords.length ? "OpenET Data" : etLoading ? "Loading" : "No Live Data"}
          icon={Droplets}
          info="Historical ET comes from OpenET, with PocketBase checked first. The large value is summed actual ET when available; otherwise it falls back to summed reference ETo. The detail line is summed historical reference ETo."
        />
        <MetricCard
          label="Forecast PET"
          value={forecastPetRecords.length ? inches(cumulativeForecastPetMm) : "Pending"}
          detail={forecastPetRecords.length ? `${forecastPetRecords.length} day Climate Toolbox PET forecast` : etLoading ? "Loading Climate Toolbox PET" : "No forecast PET loaded"}
          badge={forecastPetRecords.length ? "Climate Toolbox" : etLoading ? "Loading" : "Forecast WIP"}
          icon={Droplets}
          tone="success"
          info="Forecast PET comes from Climate Toolbox CFS PET. The response is cumulative millimeters, so the app converts it to daily increments, sums the next 28 days, and displays inches."
        />
        <MetricCard
          label="Cumulative GDD"
          value={weatherRecords.length ? Math.round(snapshot.currentGdd).toLocaleString() : "Pending"}
          detail={weatherRecords.length ? `Projected from ${weatherRecords.length} forecast weather days` : "Live weather provider needed"}
          badge={weatherRecords.length ? `Kc ${snapshot.currentKc.toFixed(2)}` : "Weather WIP"}
          icon={ThermometerSun}
          tone="success"
          info="GDD uses Climate Toolbox forecast Tmin/Tmax and the selected crop's base/upper temperatures. Accumulation starts at the field stage-start date. Kc is interpolated from crop progress, using any field-specific stage thresholds."
        />
        <MetricCard
          label="Irrigation Window"
          value={weatherRecords.length ? (typeof irrigationWindow.days === "number" ? `${irrigationWindow.days} days` : ">28 days") : "Pending"}
          detail={
            weatherRecords.length
              ? `No irrigation assumed; RAW ${Math.round(irrigationWindow.rawMm)} mm, projected depletion ${Math.round(irrigationWindow.depletionMm)} mm`
              : "Forecast ET and precipitation needed"
          }
          badge={weatherRecords.length ? "Forecast estimate" : "Water WIP"}
          icon={Droplets}
          tone={typeof irrigationWindow.days === "number" && irrigationWindow.days <= 7 ? "warning" : "success"}
          info="This estimates when depletion reaches RAW: AWHC × root depth × MAD. Each forecast day adds crop ET and subtracts forecast precipitation. It assumes no irrigation because applied-water records are not integrated yet."
        />
        {snapshot.chillRequirement ? (
          <MetricCard
            label="Chill Portions"
            value={weatherRecords.length ? `${snapshot.chillPortions ?? 0}` : "Pending"}
            detail={weatherRecords.length ? `${chillPercent}% of ${snapshot.chillRequirement} portion requirement from forecast weather` : "Hourly live weather provider needed"}
            badge={weatherRecords.length ? `${crop.label} Specific` : "Weather WIP"}
            icon={Snowflake}
            tone="success"
            info="Chill is currently estimated from Climate Toolbox forecast daily temperatures using the app's simplified chill-portions function. It is forecast-only and should be replaced with observed hourly temperatures for advisory-grade chill tracking."
          />
        ) : (
          <MetricCard
            label="Crop Cycle"
            value={snapshot.currentStage.label}
            detail="Chill tracking is not required for this crop."
            icon={Snowflake}
            info="Current stage is selected from cumulative GDD and the field's configured stage thresholds. If no custom thresholds are saved, crop profile defaults are used."
          />
        )}
      </section>

      <section className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-title-row">
            <div>
              <h2>ET Activity</h2>
              <p>Past OpenET records with 28-day forecast PET from Climate Toolbox</p>
            </div>
            <div className="segmented">
              <button className={etChartMode === "daily" ? "selected" : ""} type="button" onClick={() => setEtChartMode("daily")}>
                Daily
              </button>
              <button className={etChartMode === "cumulative" ? "selected" : ""} type="button" onClick={() => setEtChartMode("cumulative")}>
                Cumulative
              </button>
            </div>
          </div>
          <div className="chart-wrap">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 24, right: 28, bottom: 18, left: 16 }} barCategoryGap="6%" barGap={1}>
                  <CartesianGrid stroke="#d8ddd6" strokeDasharray="2 8" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} ticks={chartTicks} minTickGap={0} tick={{ fontSize: 11 }} height={42} />
                  <YAxis tickLine={false} axisLine={false} width={58} tickMargin={8} tick={{ fontSize: 12 }} label={{ value: chartLabel, angle: -90, position: "insideLeft", offset: -4 }} />
                  <Tooltip
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        actual: "Actual ET",
                        reference: "Reference ETo",
                        forecast: "Forecast PET",
                        forecastP10: "PET 10th percentile",
                        forecastP90: "PET 90th percentile",
                      };
                      return [`${Number(value).toFixed(2)} in`, labels[String(name)] ?? String(name)];
                    }}
                    labelFormatter={(label) => chartData.find((point) => point.date === label)?.fullDate ?? label}
                  />
                  <Bar dataKey="actual" fill="#061827" maxBarSize={24} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="reference" fill="#934936" maxBarSize={24} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="forecast" fill="#4a7c59" maxBarSize={24} radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="forecastP10" stroke="#86a873" strokeDasharray="4 4" dot={false} strokeWidth={1.5} connectNulls />
                  <Line type="monotone" dataKey="forecastP90" stroke="#2f5f3c" strokeDasharray="4 4" dot={false} strokeWidth={1.5} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            ) : null}
            {isEtChartLoading ? (
              <div className="chart-loading" role="status" aria-live="polite">
                <LoaderCircle size={34} />
                <span>Loading ET data</span>
              </div>
            ) : null}
            {!etLoading && !chartData.length ? <div className="chart-empty">No ET records loaded for this field and date range.</div> : null}
          </div>
          <div className="legend">
            <span className="legend-etc">Actual ET</span>
            <span className="legend-eto">Reference ETo</span>
            <span className="legend-forecast">Forecast PET</span>
            <span className="legend-forecast-range">PET P10/P90</span>
          </div>
        </section>

        <section className="panel mini-chart">
          <h2>GDD Accumulation</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={snapshot.records.map((record) => ({ date: formatDateLabel(record.date), gdd: record.cumulativeGdd }))}>
              <CartesianGrid stroke="#e4e2de" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={42} />
              <Tooltip />
              <Area type="monotone" dataKey="gdd" stroke="#061827" fill="#d1e9cb" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="panel status-panel">
          <h2>Crop-Specific Metrics</h2>
          <dl>
            <div>
              <dt>Current Stage</dt>
              <dd>{snapshot.currentStage.label}</dd>
            </div>
            <div>
              <dt>Crop Coefficient</dt>
              <dd>{snapshot.currentKc.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Latest Crop ET</dt>
              <dd>{latest?.etcMm ?? 0} mm/day</dd>
            </div>
            <div>
              <dt>Data Sources</dt>
              <dd>{dataSourceLabel}</dd>
            </div>
            <div>
              <dt>PocketBase ET Data</dt>
              <dd>{formatLoadFlag(loadFlags.pocketBaseEtData)}</dd>
            </div>
            <div>
              <dt>OpenET API</dt>
              <dd>{formatLoadFlag(loadFlags.openEtApi)}</dd>
            </div>
            <div>
              <dt>PocketBase ET Save</dt>
              <dd>{formatLoadFlag(loadFlags.pocketBaseEtSave)}</dd>
            </div>
            <div>
              <dt>Climate Toolbox Weather</dt>
              <dd>{formatLoadFlag(loadFlags.climateToolboxWeather)}</dd>
            </div>
          </dl>
        </section>
      </section>
    </main>
  );
}
