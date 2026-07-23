// Single maintenance-facing registry of every external service Water3D talks to.
//
// Purpose: when an endpoint moves, a proxy path changes, or a maintainer needs
// to know *who* owns a data source, this is the one place to look. Per-service
// runtime configuration still lives in the individual `config/*.ts` modules and
// is imported here so the machine-readable URLs never drift from what the app
// actually calls; the human-only fields (owner, contacts, notes) are authored
// inline. See DATA_FLOW.md for how each source's units map onto the dashboard.

import { climateToolboxConfig } from "./climate";
import { gridMetConfig } from "./gridmet";
import { openMeteoConfig } from "./openMeteo";

export interface ApiOwner {
  org: string;
  /** Best available maintenance contact (person, team, or docs link). */
  contact: string;
}

export interface ApiRegistryEntry {
  id: string;
  name: string;
  /** What Water3D uses this service for. */
  role: string;
  /** Upstream host the proxy forwards to (empty for direct/browser-only calls). */
  upstreamBaseUrl: string;
  /** Path the browser calls (same-origin proxy) — see vite.config.ts / deploy/traefik. */
  proxyPath: string;
  httpMethod: "GET" | "POST" | "REST" | "mixed";
  /** `config/*.ts` module holding the runtime settings for this service. */
  configModule: string;
  /** `api/*.ts` provider client that issues the requests. */
  providerModule: string;
  owner: ApiOwner;
  docsUrl?: string;
  notes?: string;
  /** A planned migration that will supersede this entry (e.g. a new endpoint). */
  plannedReplacement?: string;
}

export const API_REGISTRY: ApiRegistryEntry[] = [
  {
    id: "gridmet",
    name: "gridMET (Climate Toolbox web services)",
    role: "Primary observed daily history (temps, precip, reference ET, RH, VPD) 1979→present — the backbone of GDD, ETc, chill, and the 30-yr climatology.",
    upstreamBaseUrl: gridMetConfig.baseUrl,
    proxyPath: "/api/gridmet",
    httpMethod: "GET",
    configModule: "src/config/gridmet.ts",
    providerModule: "src/api/gridMet.ts",
    owner: { org: "University of Idaho — Northwest Knowledge Network / Climate Toolbox", contact: "Katherine Hegewisch (Climate Toolbox API contact)" },
    notes: "One netCDF extraction per variable (~12-16s each); ~2-day data lag surfaced via the data-available-through quality flag.",
    plannedReplacement:
      "Katherine to provide a pre-computed P10/P50/mean temperature endpoint to reduce API calls; drop it in behind the ClimatologyProvider seam (api/queries/climatology.ts).",
  },
  {
    id: "chill-toolbox",
    name: "Climate Toolbox precomputed chill",
    role: "Chill view: observed daily Chill Portions (Dynamic Model) for the dormant season + the Oct1-anchored P10/P50/P90 normal band (1979–2022). Replaces the on-device Dynamic Model as the primary chill source; that model stays as a fallback.",
    upstreamBaseUrl: gridMetConfig.baseUrl,
    proxyPath: "/api/gridmet",
    httpMethod: "GET",
    configModule: "src/config/chillToolbox.ts",
    providerModule: "src/api/chillClimate.ts",
    owner: { org: "University of Idaho — Northwest Knowledge Network / Climate Toolbox", contact: "Katherine Hegewisch (Climate Toolbox API contact)" },
    notes: "Same netCDF endpoint/proxy as gridMET. Observed file is year-versioned under a testing path (chill_portion_<springYear>.nc); band files are static climatology. Bands are keyed by day-of-season (placeholder year), aligned to observed by index-from-Oct-1.",
  },
  {
    id: "climate-toolbox-cfs",
    name: "Climate Toolbox CFSv2 forecast",
    role: "28-day, 48-member ensemble forecast extending the season forward; forecast GDD/ETc, the P10/P90 band, and projected stage dates.",
    upstreamBaseUrl: climateToolboxConfig.cfsBaseUrl,
    proxyPath: "/api/climate-toolbox",
    httpMethod: "GET",
    configModule: "src/config/climate.ts",
    providerModule: "src/api/climate.ts",
    owner: { org: "University of Idaho — Northwest Knowledge Network / Climate Toolbox", contact: "Katherine Hegewisch (Climate Toolbox API contact)" },
    notes: "pet/pr arrive cumulative and must be de-accumulated; reduced to daily medians before use.",
  },
  {
    id: "open-meteo",
    name: "Open-Meteo historical archive",
    role: "The only source of real hourly temperatures — drives chill-hour accounting over the dormant season.",
    upstreamBaseUrl: openMeteoConfig.archiveBaseUrl,
    proxyPath: "/api/open-meteo",
    httpMethod: "GET",
    configModule: "src/config/openMeteo.ts",
    providerModule: "src/api/openMeteo.ts",
    owner: { org: "Open-Meteo", contact: "https://open-meteo.com/en/docs" },
    docsUrl: "https://open-meteo.com/en/docs/historical-weather-api",
    notes: "Requested already in metric (°C, mm).",
  },
  {
    id: "open-meteo-forecast",
    name: "Open-Meteo forecast API",
    role: "Seam backfill: the 1-3 recent days covered by neither gridMET (lags ~2 days) nor the CFS forecast (starts at its latest model run). Past days are observation-assimilated analysis, validated within ~1 GDD/day of gridMET.",
    upstreamBaseUrl: openMeteoConfig.forecastBaseUrl,
    proxyPath: "/api/open-meteo-forecast",
    httpMethod: "GET",
    configModule: "src/config/openMeteo.ts",
    providerModule: "src/api/openMeteo.ts",
    owner: { org: "Open-Meteo", contact: "https://open-meteo.com/en/docs" },
    docsUrl: "https://open-meteo.com/en/docs",
    notes: "Different upstream host than the archive (api. vs archive-api.); the proxy path shares the /api/open-meteo prefix, so its router must outrank the archive's (see vite.config.ts / deploy/traefik/dynamic.yml).",
  },
  {
    id: "esri-world-imagery",
    name: "Esri World Imagery (satellite tiles)",
    role: "Field-picker basemap (MapLibre GL raster tiles) and field thumbnails (MapServer export endpoint). Called directly (not proxied).",
    upstreamBaseUrl: "https://server.arcgisonline.com",
    proxyPath: "(direct — not proxied)",
    httpMethod: "GET",
    configModule: "src/config/map.ts",
    providerModule: "src/components/FieldSetupMap.tsx, FieldMapThumbnail.tsx",
    owner: { org: "Esri", contact: "https://www.esri.com/en-us/legal/terms/data-attributions" },
    notes: "Keyless; attribution required and shown in the map's attribution control / thumbnail corner.",
  },
  {
    id: "nominatim",
    name: "OSM Nominatim (geocoding)",
    role: "Address/place → lat/lon during field setup — the coordinates that key every weather/ET request. Called directly (not proxied).",
    upstreamBaseUrl: "https://nominatim.openstreetmap.org",
    proxyPath: "(direct — not proxied)",
    httpMethod: "GET",
    configModule: "src/config/map.ts",
    providerModule: "src/components/LocationSearch.tsx",
    owner: { org: "OpenStreetMap Foundation", contact: "https://operations.osmfoundation.org/policies/nominatim/" },
    notes: "Keyless; usage policy caps at 1 req/s and disallows autocomplete — search fires on Enter only.",
  },
];
