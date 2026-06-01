import { AlertTriangle, CalendarDays, Download, Droplets, Snowflake, ThermometerSun } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getSupportedOpenEtDateRange, openEtApi, openEtProvider } from "../api/openEt";
import { buildAnalyticsSnapshot } from "../calcs/analytics";
import { cropProfiles } from "../data/crops";
import { mockWeatherRecords } from "../data/weather";
import type { FieldConfig, WeatherRecord } from "../types/domain";
import type { EtDataResponse } from "../api/contracts";
import { debugDataSource } from "../utils/debug";
import { getRollingDateRange } from "../utils/dateRange";
import { MetricCard } from "./MetricCard";
import { useEffect, useMemo, useState } from "react";

interface DashboardProps {
  field: FieldConfig;
}

type EtChartMode = "daily" | "cumulative";
type EtRecord = EtDataResponse["records"][number];

function inches(mm: number): string {
  return `${(mm / 25.4).toFixed(1)}"`;
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

function isOpenEtAvailabilityError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("OpenET data is currently configured through");
}

export function Dashboard({ field }: DashboardProps) {
  const dateRange = useMemo(() => getRollingDateRange(30), []);
  const [weatherRecords] = useState<WeatherRecord[]>(mockWeatherRecords);
  const [etRecords, setEtRecords] = useState<EtRecord[]>(() => buildDemoEtRecords());
  const [dataSourceLabel, setDataSourceLabel] = useState(openEtApi.enabled ? "OpenET loading" : "Demo data");
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [etChartMode, setEtChartMode] = useState<EtChartMode>("cumulative");
  const crop = cropProfiles[field.cropId];

  useEffect(() => {
    let ignore = false;

    async function loadOpenEtData() {
      if (!openEtApi.enabled) {
        setEtRecords(buildDemoEtRecords());
        setDataSourceLabel("Demo data");
        setDataWarning(null);
        debugDataSource("openet", "disabled; no live ET data loaded", {
          enabled: false,
          fieldId: field.id,
        });
        return;
      }

      try {
        const openEtDateRange = getSupportedOpenEtDateRange({
          cropId: field.cropId,
          lat: field.lat,
          lon: field.lon,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });

        setDataSourceLabel("OpenET loading");
        debugDataSource("openet", "request started", {
          enabled: true,
          fieldId: field.id,
          cropId: field.cropId,
          lat: field.lat,
          lon: field.lon,
          startDate: openEtDateRange.startDate,
          endDate: openEtDateRange.endDate,
          requestUrl: openEtApi.urls.pointTimeseries,
        });
        const response = await openEtProvider.getEtData({
          cropId: field.cropId,
          lat: field.lat,
          lon: field.lon,
          startDate: openEtDateRange.startDate,
          endDate: openEtDateRange.endDate,
        });

        if (ignore) {
          return;
        }

        setEtRecords(response.records);
        setDataSourceLabel("OpenET live");
        setDataWarning(null);
        debugDataSource("openet", "live records loaded into dashboard", {
          fieldId: field.id,
          returnedRecords: response.records.length,
          recordsWithActualEt: response.records.filter((record) => typeof record.etActualMm === "number").length,
          recordsWithReferenceEt: response.records.filter((record) => typeof record.etoMm === "number").length,
          recordsWithPrecip: response.records.filter((record) => typeof record.precipMm === "number").length,
        });
      } catch (error) {
        if (ignore) {
          return;
        }

        setEtRecords(buildDemoEtRecords());
        setDataSourceLabel("Demo data");
        setDataWarning(null);
        debugDataSource("openet", isOpenEtAvailabilityError(error) ? "request skipped; date range unavailable" : "request failed; no local demo data used", {
          fieldId: field.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    void loadOpenEtData();

    return () => {
      ignore = true;
    };
  }, [dateRange.endDate, dateRange.startDate, field.cropId, field.id, field.lat, field.lon]);

  const snapshot = useMemo(() => buildAnalyticsSnapshot(field, crop, weatherRecords, []), [crop, field, weatherRecords]);
  const latest = snapshot.records.at(-1);
  const cumulativeActualEtMm = etRecords.reduce((total, record) => total + (record.etActualMm ?? 0), 0);
  const cumulativeReferenceEtMm = etRecords.reduce((total, record) => total + (record.etoMm ?? record.etReferenceMm ?? 0), 0);
  const chartData = useMemo(() => {
    let cumulativeActual = 0;
    let cumulativeReference = 0;

    return etRecords.map((record) => {
      const actual = record.etActualMm ?? 0;
      const reference = record.etoMm ?? record.etReferenceMm ?? 0;

      cumulativeActual += actual;
      cumulativeReference += reference;

      return {
        date: formatDateLabel(record.date),
        fullDate: record.date,
        actual: Number(((etChartMode === "daily" ? actual : cumulativeActual) / 25.4).toFixed(2)),
        reference: Number(((etChartMode === "daily" ? reference : cumulativeReference) / 25.4).toFixed(2)),
      };
    });
  }, [etChartMode, etRecords]);
  const labelStep = Math.max(1, Math.ceil(chartData.length / 6));
  const chartTicks = chartData.filter((_, index) => index % labelStep === 0 || index === chartData.length - 1).map((point) => point.date);
  const chartLabel = etChartMode === "daily" ? "Daily ET (in/day)" : "Cumulative ET (in)";
  const chillPercent =
    snapshot.chillPortions && snapshot.chillRequirement
      ? Math.min(100, Math.round((snapshot.chillPortions / snapshot.chillRequirement) * 100))
      : undefined;

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <div className="heading-row">
            <h1>Real-Time Insights</h1>
            <span className="season-badge">
              {formatDateLabel(dateRange.startDate)} - {formatDateLabel(dateRange.endDate)}
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
            Last 30 Days
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
          value={etRecords.length ? inches(cumulativeActualEtMm || cumulativeReferenceEtMm) : "Pending"}
          detail={etRecords.length ? `${inches(cumulativeReferenceEtMm)} reference ETo` : "Configure OpenET for live ET"}
          badge={etRecords.length ? "OpenET Data" : "No Live Data"}
          icon={Droplets}
        />
        <MetricCard
          label="Cumulative GDD"
          value={weatherRecords.length ? Math.round(snapshot.currentGdd).toLocaleString() : "Pending"}
          detail={weatherRecords.length ? `${snapshot.currentStage.label}${snapshot.nextStage ? ` - next: ${snapshot.nextStage.label}` : ""}` : "Live weather provider needed"}
          badge={weatherRecords.length ? `Kc ${snapshot.currentKc.toFixed(2)}` : "Weather WIP"}
          icon={ThermometerSun}
          tone="success"
        />
        {snapshot.chillRequirement ? (
          <MetricCard
            label="Chill Portions"
            value={weatherRecords.length ? `${snapshot.chillPortions ?? 0}` : "Pending"}
            detail={weatherRecords.length ? `${chillPercent}% of ${snapshot.chillRequirement} portion requirement` : "Hourly live weather provider needed"}
            badge={weatherRecords.length ? `${crop.label} Specific` : "Weather WIP"}
            icon={Snowflake}
            tone="success"
          />
        ) : (
          <MetricCard label="Crop Cycle" value={snapshot.currentStage.label} detail="Chill tracking is not required for this crop." icon={Snowflake} />
        )}
        <MetricCard
          label="Hydrological Stress"
          value={weatherRecords.length ? snapshot.stressLevel.toUpperCase() : "Pending"}
          detail={weatherRecords.length ? `VPD: ${snapshot.vpdKpa ?? "n/a"} kPa - ${snapshot.stressLevel === "low" ? "normal range" : "watch crop demand"}` : "Live humidity/dewpoint provider needed"}
          badge="Weather WIP"
          icon={AlertTriangle}
          tone={snapshot.stressLevel === "low" ? "success" : "warning"}
        />
      </section>

      <section className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-title-row">
            <div>
              <h2>ET Activity</h2>
              <p>Past 30 days of actual ET and reference ETo from live OpenET records</p>
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 24, right: 28, bottom: 18, left: 16 }}>
                <CartesianGrid stroke="#d8ddd6" strokeDasharray="2 8" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  ticks={chartTicks}
                  minTickGap={0}
                  tick={{ fontSize: 11 }}
                  height={42}
                />
                <YAxis tickLine={false} axisLine={false} width={58} tickMargin={8} tick={{ fontSize: 12 }} label={{ value: chartLabel, angle: -90, position: "insideLeft", offset: -4 }} />
                <Tooltip
                  formatter={(value, name) => [`${Number(value).toFixed(2)} in`, name === "actual" ? "Actual ET" : "Reference ETo"]}
                  labelFormatter={(label) => chartData.find((point) => point.date === label)?.fullDate ?? label}
                />
                <Line type="monotone" dataKey="actual" stroke="#061827" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="reference" stroke="#934936" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            <span className="legend-etc">Actual ET</span>
            <span className="legend-eto">Reference ETo</span>
          </div>
        </section>

        <section className="panel insight-panel">
          <h2>Precision Insights</h2>
          <div className="insight-list">
            {snapshot.insights.map((insight, index) => (
              <article key={insight} className={`insight insight-${index}`}>
                <strong>{index === 0 ? "Degree Days" : index === 1 ? "ET Comparison" : "Stress Signal"}</strong>
                <p>{insight}</p>
              </article>
            ))}
          </div>
          <button className="report-button">View Full Report</button>
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
          </dl>
        </section>
      </section>
    </main>
  );
}

function buildDemoEtRecords(): EtRecord[] {
  return mockWeatherRecords.map((record) => ({
    date: record.date,
    etoMm: record.etoMm,
    etActualMm: Number((record.etoMm * 0.92).toFixed(1)),
    etReferenceMm: record.etoMm,
    precipMm: record.precipMm,
    source: record.source,
  }));
}
