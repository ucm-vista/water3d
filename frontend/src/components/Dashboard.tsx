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
import { mockAppliedWaterMm, mockWeatherRecords } from "../data/weather";
import { openEtApi, openEtProvider } from "../api";
import { buildAnalyticsSnapshot } from "../calcs/analytics";
import { cropProfiles } from "../data/crops";
import type { FieldConfig, WeatherRecord } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { MetricCard } from "./MetricCard";
import { useEffect, useMemo, useState } from "react";

interface DashboardProps {
  field: FieldConfig;
}

type EtChartMode = "daily" | "cumulative";

function inches(mm: number): string {
  return `${(mm / 25.4).toFixed(1)}"`;
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

function dateToUtcMs(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function interpolateNumber(start: number | undefined, end: number | undefined, ratio: number) {
  if (typeof start !== "number" || typeof end !== "number") {
    return start ?? end;
  }

  return Number((start + (end - start) * ratio).toFixed(2));
}

function expandWeatherRecordsDaily(records: WeatherRecord[]) {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const expanded: WeatherRecord[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const daySpan = Math.max(1, Math.round((dateToUtcMs(next.date) - dateToUtcMs(current.date)) / 86_400_000));

    for (let offset = 0; offset < daySpan; offset += 1) {
      const ratio = offset / daySpan;
      const date = addDays(current.date, offset);

      expanded.push({
        date,
        tminC: interpolateNumber(current.tminC, next.tminC, ratio) ?? current.tminC,
        tmaxC: interpolateNumber(current.tmaxC, next.tmaxC, ratio) ?? current.tmaxC,
        precipMm: offset === 0 ? current.precipMm : 0,
        etoMm: interpolateNumber(current.etoMm, next.etoMm, ratio) ?? current.etoMm,
        rhMin: interpolateNumber(current.rhMin, next.rhMin, ratio),
        rhMax: interpolateNumber(current.rhMax, next.rhMax, ratio),
        source: current.source,
      });
    }
  }

  const last = sorted.at(-1);
  if (last) {
    expanded.push(last);
  }

  return expanded;
}

export function Dashboard({ field }: DashboardProps) {
  const baseWeatherRecords = useMemo(() => expandWeatherRecordsDaily(mockWeatherRecords), []);
  const [weatherRecords, setWeatherRecords] = useState<WeatherRecord[]>(baseWeatherRecords);
  const [dataSourceLabel, setDataSourceLabel] = useState(openEtApi.enabled ? "OpenET loading" : "Local demo data");
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [etChartMode, setEtChartMode] = useState<EtChartMode>("cumulative");
  const crop = cropProfiles[field.cropId];

  useEffect(() => {
    let ignore = false;

    async function loadOpenEtData() {
      if (!openEtApi.enabled) {
        setWeatherRecords(baseWeatherRecords);
        setDataSourceLabel("Local demo data");
        setDataWarning(null);
        debugDataSource("openet", "disabled; using local demo data", {
          enabled: false,
          fieldId: field.id,
        });
        return;
      }

      try {
        setDataSourceLabel("OpenET loading");
        debugDataSource("openet", "request started", {
          enabled: true,
          fieldId: field.id,
          cropId: field.cropId,
          lat: field.lat,
          lon: field.lon,
          startDate: baseWeatherRecords[0].date,
          endDate: baseWeatherRecords.at(-1)?.date ?? baseWeatherRecords[0].date,
          requestUrl: openEtApi.urls.pointTimeseries,
        });
        const response = await openEtProvider.getEtData({
          cropId: field.cropId,
          lat: field.lat,
          lon: field.lon,
          startDate: baseWeatherRecords[0].date,
          endDate: baseWeatherRecords.at(-1)?.date ?? baseWeatherRecords[0].date,
        });

        if (ignore) {
          return;
        }

        const openEtByDate = new Map(response.records.map((record) => [record.date, record]));
        const mergedRecords = baseWeatherRecords.map((record) => {
          const openEtRecord = openEtByDate.get(record.date);

          return {
            ...record,
            etoMm: openEtRecord?.etoMm ?? record.etoMm,
            precipMm: openEtRecord?.precipMm ?? record.precipMm,
            etActualMm: openEtRecord?.etActualMm,
            ndvi: openEtRecord?.ndvi,
            modelCount: openEtRecord?.modelCount,
          };
        });

        setWeatherRecords(mergedRecords);
        setDataSourceLabel("OpenET + local weather");
        setDataWarning(null);
        debugDataSource("openet", "records merged into dashboard", {
          fieldId: field.id,
          returnedRecords: response.records.length,
          mergedRecords: mergedRecords.length,
          recordsWithActualEt: mergedRecords.filter((record) => typeof record.etActualMm === "number").length,
          recordsWithReferenceEt: mergedRecords.filter((record) => typeof record.etoMm === "number").length,
          recordsWithPrecip: mergedRecords.filter((record) => typeof record.precipMm === "number").length,
        });
      } catch (error) {
        if (ignore) {
          return;
        }

        setWeatherRecords(baseWeatherRecords);
        setDataSourceLabel("Local demo data");
        setDataWarning(error instanceof Error ? error.message : "OpenET data could not be loaded.");
        debugDataSource("openet", "request failed; using local demo data", {
          fieldId: field.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    void loadOpenEtData();

    return () => {
      ignore = true;
    };
  }, [baseWeatherRecords, field.cropId, field.id, field.lat, field.lon]);

  const snapshot = useMemo(() => buildAnalyticsSnapshot(field, crop, weatherRecords, mockAppliedWaterMm), [crop, field, weatherRecords]);
  const latest = snapshot.records.at(-1);
  const chartData = useMemo(() => {
    let cumulativeEto = 0;
    let cumulativeEtc = 0;
    let cumulativeHistorical = 0;

    return snapshot.records.map((record, index) => {
      const eto = weatherRecords[index].etoMm;
      const historical = weatherRecords[index].etoMm * 0.9;

      cumulativeEto += eto;
      cumulativeEtc += record.etcMm;
      cumulativeHistorical += historical;

      return {
        date: formatDateLabel(record.date),
        fullDate: record.date,
        eto: Number(((etChartMode === "daily" ? eto : cumulativeEto) / 25.4).toFixed(2)),
        etc: Number(((etChartMode === "daily" ? record.etcMm : cumulativeEtc) / 25.4).toFixed(2)),
        historical: Number(((etChartMode === "daily" ? historical : cumulativeHistorical) / 25.4).toFixed(2)),
      };
    });
  }, [etChartMode, snapshot.records, weatherRecords]);
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
            <span className="season-badge">Active Season</span>
            <span className="data-source-badge">{dataSourceLabel}</span>
          </div>
          <p>
            {field.name} - Block A-12 - {field.cropLabel}
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
          value={inches(snapshot.cumulativeEtcMm)}
          detail={`${inches(snapshot.cumulativeEtcMm - snapshot.cumulativeEtoMm)} vs reference ETo`}
          badge={openEtApi.enabled && !dataWarning ? "OpenET Data" : "Demo Data"}
          icon={Droplets}
        />
        <MetricCard
          label="Cumulative GDD"
          value={Math.round(snapshot.currentGdd).toLocaleString()}
          detail={`${snapshot.currentStage.label}${snapshot.nextStage ? ` - next: ${snapshot.nextStage.label}` : ""}`}
          badge={`Kc ${snapshot.currentKc.toFixed(2)}`}
          icon={ThermometerSun}
          tone="success"
        />
        {snapshot.chillRequirement ? (
          <MetricCard
            label="Chill Portions"
            value={`${snapshot.chillPortions ?? 0}`}
            detail={`${chillPercent}% of ${snapshot.chillRequirement} portion requirement`}
            badge={`${crop.label} Specific`}
            icon={Snowflake}
            tone="success"
          />
        ) : (
          <MetricCard label="Crop Cycle" value={snapshot.currentStage.label} detail="Chill tracking is not required for this crop." icon={Snowflake} />
        )}
        <MetricCard
          label="Hydrological Stress"
          value={snapshot.stressLevel.toUpperCase()}
          detail={`VPD: ${snapshot.vpdKpa ?? "n/a"} kPa - ${snapshot.stressLevel === "low" ? "normal range" : "watch crop demand"}`}
          badge="Climate API"
          icon={AlertTriangle}
          tone={snapshot.stressLevel === "low" ? "success" : "warning"}
        />
      </section>

      <section className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-title-row">
            <div>
              <h2>ET Forecast & Historical Comparison</h2>
              <p>Crop ET, reference ETo, and historical range from stable API feeds</p>
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
                  formatter={(value, name) => [`${Number(value).toFixed(2)} in`, name === "etc" ? "ETc" : name === "eto" ? "Reference ETo" : "Historical range"]}
                  labelFormatter={(label) => chartData.find((point) => point.date === label)?.fullDate ?? label}
                />
                <Area type="monotone" dataKey="historical" stroke="none" fill="#e7e6e1" />
                <Line type="monotone" dataKey="etc" stroke="#061827" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="eto" stroke="#934936" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            <span className="legend-etc">ETc</span>
            <span className="legend-eto">Reference ETo</span>
            <span className="legend-range">Historical Range</span>
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
