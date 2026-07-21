import {
  CalendarClock,
  ChevronRight,
  Database,
  Droplets,
  Gauge,
  Info,
  MapPin,
  Plus,
  Snowflake,
  Sprout,
  ThermometerSun,
} from "lucide-react";
import { MetricCard } from "./MetricCard";

interface HomeProps {
  /** Whether the user has any fields yet — changes the primary call to action. */
  hasFields: boolean;
  /** Go to the Fields view (setup / management). */
  onGetStarted: () => void;
}

// "At a glance" tiles. These reuse the Analytics MetricCard component (same
// styling) so Home reads as the same product as the dashboard — but the values
// are static facts about the tool, not live field data.
const STATS = [
  { label: "Supported crops", value: "6", detail: "Local v1 profiles with editable GDD stages", icon: Sprout },
  { label: "History depth", value: "1979", detail: "Earliest gridMET daily record", icon: CalendarClock },
  { label: "Climatology baseline", value: "30 yr", detail: "Normal + P10–P90 bands per calendar day", icon: Gauge },
  { label: "Forecast horizon", value: "28 day", detail: "Climate Toolbox CFS ensemble", icon: ThermometerSun },
];

const FEATURES = [
  {
    icon: ThermometerSun,
    title: "GDD & growth stages",
    body: "Full calendar-year growing-degree-day chart with observed history, forecast, and a projected year-end curve from the 30-year average — plus per-stage timeline dates.",
  },
  {
    icon: Sprout,
    title: "Crop-aware profiles",
    body: "Base/upper temps, Kc curves, and GDD stage thresholds per crop. Stages are editable per field and override the profile defaults.",
  },
  {
    icon: Droplets,
    title: "Chill & evapotranspiration",
    body: "Chill-portion accumulation for perennials from real hourly temperatures, and crop-ET tracking driven by gridMET reference ETo.",
  },
  {
    icon: CalendarClock,
    title: "Year-over-year context",
    body: "Metric cards answer grower questions — days ahead/behind the 30-year normal, current stage, and projected next-stage dates.",
  },
];

// The computations behind every chart and metric card in Analytics. Each entry
// pairs the method (the `formula` line, rendered in the mono chart-label font)
// with the source data it runs on. Kept in sync with src/calcs/*.
const COMPUTATIONS = [
  {
    icon: ThermometerSun,
    title: "Growing Degree Days",
    formula: "GDD = max(0, (min(Tmax, upper) + max(Tmin, base)) / 2 − base)",
    body: "The averaging method, capped at the crop's base and upper thresholds, run on each day's gridMET min/max air temperature and accumulated from the field's biofix. See calcs/gdd.ts.",
  },
  {
    icon: Droplets,
    title: "Crop evapotranspiration (ETc)",
    formula: "ETc = ETo × Kc(stage)",
    body: "Reference ETo is scaled by the crop coefficient Kc, interpolated along the crop's Kc curve using GDD-based season progress. See calcs/kc.ts + calcs/analytics.ts.",
  },
  {
    icon: CalendarClock,
    title: "Growth-stage projection",
    formula: "observed  →  28-day forecast  →  30-yr avg daily rate",
    body: "Each stage's GDD threshold is dated from observed accumulation first, then the CFS forecast, then extended along the 30-year average daily GDD rate for calendar days beyond the forecast. See calcs/stageProjection.ts.",
  },
  {
    icon: Snowflake,
    title: "Winter chill accumulation",
    formula: "Dynamic Model (Fishman–Erez) chill portions",
    body: "Chill portions are accumulated from real hourly temperatures for perennials; Climate Toolbox precomputed portions + historical bands are used where available, with a client-side fallback. See calcs/dynamicModel.ts.",
  },
  {
    icon: Gauge,
    title: "30-year climatology",
    formula: "mean + P10 / P50 / P90 per calendar day",
    body: "For each calendar day we compute the mean and 10th/50th/90th percentiles of cumulative GDD, reference ETo, and precipitation across the prior 30 seasons — the “normal” curves and shaded bands. See calcs/climatology.ts.",
  },
  {
    icon: Droplets,
    title: "Vapor-pressure deficit (VPD)",
    formula: "daily mean VPD from temperature + humidity",
    body: "Daily mean VPD is derived from gridMET temperature and humidity and drives the crop-stress read-out. See calcs/vpd.ts.",
  },
];

const CROPS = ["Almond", "Processing Tomato", "Wine Grape", "Pistachio", "Cotton", "Alfalfa"];

const DATA_SOURCES = [
  { name: "gridMET", role: "Primary daily history — Tmin/Tmax, precip, reference ETo, RH, and VPD on a ~4 km grid back to 1979. Drives GDD, ETo, precipitation, and the 30-year climatology." },
  { name: "Climate Toolbox CFS", role: "28-day forward PET + weather forecast from the CFSv2 ensemble; extends the season lines and stage projections past today." },
  { name: "Open-Meteo", role: "Real hourly air temperatures feeding the Dynamic-Model chill calculation." },
  { name: "Climate Toolbox winter-chill", role: "Precomputed chill-portion accumulation and historical bands for perennials." },
  { name: "Esri + OSM Nominatim", role: "Keyless satellite basemap, geocoding, and static thumbnails during field setup." },
];

// The Home view: an about-style landing page that introduces Water 3D. Shown by
// default when the user has no fields, and reachable any time from the nav. It
// reuses the Analytics design language — the mono uppercase labels, the rust
// section markers (.panel-title-row h2::before), and the MetricCard row — so the
// landing page reads as the same product as the dashboard.
export function Home({ hasFields, onGetStarted }: HomeProps) {
  return (
    <main className="content home-content">
      <div className="page-heading">
        <div>
          <h1>Water 3D</h1>
          <p className="home-tagline">
            Analytics-first irrigation and crop decision support for Central Valley growers. Locate a field on the map, pick a
            crop, and get a crop-aware dashboard driven by growing degree days, growth stages, chill, and evapotranspiration.
          </p>
        </div>
        <div className="toolbar">
          <button className="primary-button page-action-button" onClick={onGetStarted}>
            {hasFields ? "Manage fields" : "Add your first field"}
            {hasFields ? <ChevronRight size={18} /> : <Plus size={18} />}
          </button>
        </div>
      </div>

      <section className="metrics-grid home-stats">
        {STATS.map((stat) => (
          <MetricCard key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} icon={stat.icon} tone="success" />
        ))}
      </section>

      <section className="panel home-section">
        <div className="panel-title-row">
          <div>
            <h2>What you get</h2>
            <p>The four analyses that make up every field's dashboard.</p>
          </div>
        </div>
        <div className="home-grid">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="home-card">
              <span className="home-card-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel home-section">
        <div className="panel-title-row">
          <div>
            <h2>How the analytics are computed</h2>
            <p>
              Every chart line and metric card traces back to one of these calculations. Formulas mirror the code in <code>src/calcs</code>.
            </p>
          </div>
        </div>
        <div className="home-grid home-compute-grid">
          {COMPUTATIONS.map(({ icon: Icon, title, formula, body }) => (
            <article key={title} className="home-card home-compute-card">
              <div className="home-compute-head">
                <span className="home-card-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <h3>{title}</h3>
              </div>
              <code className="home-formula">{formula}</code>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel home-section">
        <div className="panel-title-row">
          <div>
            <h2>Where the data comes from</h2>
            <p>
              Live providers behind the numbers — proxied through <code>/api</code> in production.
            </p>
          </div>
        </div>
        <dl className="home-source-list">
          {DATA_SOURCES.map((source) => (
            <div key={source.name}>
              <dt>
                <Database size={13} aria-hidden="true" />
                {source.name}
              </dt>
              <dd>{source.role}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel home-section">
        <div className="panel-title-row">
          <div>
            <h2>Supported crops</h2>
            <p>Local v1 defaults with editable GDD stage thresholds. Pick “Other” to define your own.</p>
          </div>
        </div>
        <ul className="home-crop-list">
          {CROPS.map((crop) => (
            <li key={crop}>
              <Sprout size={14} aria-hidden="true" />
              {crop}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel home-note">
        <Info size={18} aria-hidden="true" />
        <p>
          Water 3D is a decision-support tool, not automated advice. Several paths are demo/fallback and stage thresholds should
          be reviewed before advisory use. Fields are stored in your browser.
        </p>
      </section>

      <button type="button" className="home-cta-secondary" onClick={onGetStarted}>
        <MapPin size={16} aria-hidden="true" />
        {hasFields ? "Go to your fields" : "Set up a field to get started"}
      </button>
    </main>
  );
}
