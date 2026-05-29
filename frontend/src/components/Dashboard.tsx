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
import { buildAnalyticsSnapshot } from "../calcs/analytics";
import { cropProfiles } from "../data/crops";
import type { FieldConfig } from "../types/domain";
import { MetricCard } from "./MetricCard";

interface DashboardProps {
  field: FieldConfig;
}

function inches(mm: number): string {
  return `${(mm / 25.4).toFixed(1)}"`;
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

export function Dashboard({ field }: DashboardProps) {
  const crop = cropProfiles[field.cropId];
  const snapshot = buildAnalyticsSnapshot(field, crop, mockWeatherRecords, mockAppliedWaterMm);
  const latest = snapshot.records.at(-1);
  const chartData = snapshot.records.map((record, index) => ({
    date: formatDateLabel(record.date),
    eto: Number((mockWeatherRecords[index].etoMm / 25.4).toFixed(2)),
    etc: Number((record.etcMm / 25.4).toFixed(2)),
    historical: Number(((mockWeatherRecords[index].etoMm * 0.9) / 25.4).toFixed(2)),
  }));
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
          </div>
          <p>
            {field.name} - Block A-12 - {field.cropLabel}
          </p>
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
          badge="OpenET Data"
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
              <button>Daily</button>
              <button className="selected">Cumulative</button>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid stroke="#d8ddd6" strokeDasharray="2 8" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <Tooltip />
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
              <dd>OpenET + Climate API</dd>
            </div>
          </dl>
        </section>
      </section>
    </main>
  );
}
