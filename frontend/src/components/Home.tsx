import { CalendarClock, ChevronRight, Droplets, Info, MapPin, Plus, Sprout, ThermometerSun } from "lucide-react";

interface HomeProps {
  /** Whether the user has any fields yet — changes the primary call to action. */
  hasFields: boolean;
  /** Go to the Fields view (setup / management). */
  onGetStarted: () => void;
}

const FEATURES = [
  {
    icon: ThermometerSun,
    title: "GDD & growth stages",
    body: "Full calendar-year growing-degree-day chart with observed history, forecast, and a projected year-end curve from the 5-year average — plus per-stage timeline dates.",
  },
  {
    icon: Sprout,
    title: "Crop-aware profiles",
    body: "Base/upper temps, Kc curves, and GDD stage thresholds per crop. Stages are editable per field and override the profile defaults.",
  },
  {
    icon: Droplets,
    title: "Chill & evapotranspiration",
    body: "Chill-hour accumulation for perennials from real hourly temperatures, and ET tracking driven by gridMET reference ET.",
  },
  {
    icon: CalendarClock,
    title: "Year-over-year context",
    body: "Metric cards answer grower questions — days ahead/behind the 5-year normal, current stage, and projected next-stage dates.",
  },
];

const CROPS = ["Almond", "Processing Tomato", "Wine Grape", "Pistachio", "Cotton", "Alfalfa"];

const DATA_SOURCES = [
  { name: "gridMET", role: "Primary daily history — Tmin/Tmax, precip, ETo, RH, VPD back to 1979." },
  { name: "Climate Toolbox CFS", role: "28-day PET + weather forecast from a 48-member ensemble." },
  { name: "Open-Meteo", role: "Real hourly temperatures for chill-hour accumulation." },
  { name: "NRCS Soil Data Access", role: "Soil map unit, texture, hydrologic group, and AWHC lookup." },
  { name: "Mapbox", role: "Search + map during field setup; static thumbnails per field." },
];

// The Home view: an about-style landing page that introduces Water 3D. Shown by
// default when the user has no fields, and reachable any time from the nav.
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
        <button className="primary-button page-action-button" onClick={onGetStarted}>
          {hasFields ? "Manage fields" : "Add your first field"}
          {hasFields ? <ChevronRight size={18} /> : <Plus size={18} />}
        </button>
      </div>

      <section className="home-grid">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <article key={title} className="panel home-card">
            <span className="home-card-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="panel home-section">
        <h2>Supported crops</h2>
        <p>Local v1 defaults with editable GDD stage thresholds. Pick “Other” to define your own.</p>
        <ul className="home-crop-list">
          {CROPS.map((crop) => (
            <li key={crop}>
              <Sprout size={14} aria-hidden="true" />
              {crop}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel home-section">
        <h2>Where the data comes from</h2>
        <dl className="home-source-list">
          {DATA_SOURCES.map((source) => (
            <div key={source.name}>
              <dt>{source.name}</dt>
              <dd>{source.role}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel home-note">
        <Info size={18} aria-hidden="true" />
        <p>
          Water 3D is a decision-support tool, not automated advice. Several paths are demo/fallback and stage thresholds should
          be reviewed before advisory use. Fields are stored in your browser until you sign in.
        </p>
      </section>

      <button type="button" className="home-cta-secondary" onClick={onGetStarted}>
        <MapPin size={16} aria-hidden="true" />
        {hasFields ? "Go to your fields" : "Set up a field to get started"}
      </button>
    </main>
  );
}
