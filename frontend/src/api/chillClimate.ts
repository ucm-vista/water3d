// Client for the Climate Toolbox precomputed winter-chill products. Reuses the
// gridMET netCDF endpoint + `/api/gridmet` proxy and the shared table-finding /
// number-parsing helpers, so this module only adds chill-specific URL shapes and
// column extraction. See config/chillToolbox.ts for the product notes.

import {
  chillBandDataPath,
  chillSeasonStartDate,
  chillToolboxConfig,
  observedChillDataPath,
} from "../config/chillToolbox";
import { getGridMetNetcdfUrl } from "../config/gridmet";
import type { ChillBandDay, ChillObservedRow } from "../calcs/chillClimatology";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { debugDataSource } from "../utils/debug";
import { findSeriesTables } from "./gridMet";
import { normalizeDate, toNumber } from "./toolboxShared";

// These files are small and precomputed (~1–2 s each), so the timeout is far
// below the 90 s used for the slow multi-decade gridMET extractions.
const CHILL_TIMEOUT_MS = 30_000;

export interface ChillToolboxRequest {
  lat: number;
  lon: number;
  springYear: number;
}

export interface ChillToolboxResponse {
  observed: ChillObservedRow[];
  band: ChillBandDay[];
}

function buildUrl(
  request: ChillToolboxRequest,
  pairs: Array<{ dataPath: string; variable: string }>,
  dates?: { start: string; end: string },
): string {
  const url = new URL(getGridMetNetcdfUrl(), window.location.origin);
  url.searchParams.set("decimal-precision", "2");
  url.searchParams.set("lat", String(request.lat));
  url.searchParams.set("lon", String(request.lon));
  url.searchParams.set("positive-east-longitude", "False");
  url.searchParams.set("request-JSON", "True");
  // The service pairs each `data-path` with the `variable` that follows it, so
  // append the trios in order rather than setting unique keys.
  for (const { dataPath, variable } of pairs) {
    url.searchParams.append("data-path", dataPath);
    url.searchParams.append("variable", variable);
    url.searchParams.append("variable-name", variable);
  }
  if (dates) {
    url.searchParams.set("start-date", dates.start);
    url.searchParams.set("end-date", dates.end);
  }
  return url.toString();
}

// Columns come back keyed as "<name>" or "<name>(<unit>)" (e.g. "chill_portion()"
// or "p50(portions)"), so match on the name prefix like parseGridMetSeries does.
function columnValues(table: Record<string, unknown>, name: string): unknown[] {
  const key = Object.keys(table).find((candidate) => candidate === name || candidate.startsWith(`${name}(`));
  return key && Array.isArray(table[key]) ? (table[key] as unknown[]) : [];
}

async function fetchTable(url: string, label: string): Promise<Record<string, unknown> | undefined> {
  const response = await fetchWithTimeout(url, {}, CHILL_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`chill ${label} request failed with ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  debugDataSource("gridmet", `raw chill ${label} response`, { payload, requestUrl: url });
  return findSeriesTables(payload)[0];
}

async function fetchObserved(request: ChillToolboxRequest): Promise<ChillObservedRow[]> {
  const url = buildUrl(
    request,
    [{ dataPath: observedChillDataPath(request.springYear), variable: "chill_portion" }],
    { start: chillSeasonStartDate(request.springYear), end: `${request.springYear}-05-01` },
  );
  const table = await fetchTable(url, "observed");
  if (!table) return [];

  const dates = (table["yyyy-mm-dd"] as unknown[]).map((date) => normalizeDate(date));
  const values = columnValues(table, "chill_portion");
  const rows: ChillObservedRow[] = [];
  dates.forEach((date, index) => {
    const value = toNumber(values[index]);
    if (date && typeof value === "number") {
      rows.push({ date, dailyPortions: value });
    }
  });
  return rows;
}

async function fetchBand(request: ChillToolboxRequest): Promise<ChillBandDay[]> {
  const percentiles = chillToolboxConfig.bandPercentiles;
  const url = buildUrl(
    request,
    percentiles.map((percentile) => ({ dataPath: chillBandDataPath(percentile), variable: percentile })),
  );
  const table = await fetchTable(url, "band");
  if (!table) return [];

  const columns = percentiles.map((percentile) => columnValues(table, percentile));
  const length = Math.max(0, ...columns.map((column) => column.length));
  const rows: ChillBandDay[] = [];
  for (let index = 0; index < length; index += 1) {
    const [p10, p50, p90] = columns.map((column) => toNumber(column[index]) ?? null);
    rows.push({ p10, p50, p90 });
  }
  return rows;
}

// Fetch both products concurrently, tolerating a per-product failure: a missing
// year-versioned observed file (testing path) should not hide the static band,
// and a band hiccup should not block the observed line.
export async function fetchChillToolbox(request: ChillToolboxRequest): Promise<ChillToolboxResponse> {
  const [observed, band] = await Promise.all([
    fetchObserved(request).catch(() => [] as ChillObservedRow[]),
    fetchBand(request).catch(() => [] as ChillBandDay[]),
  ]);
  return { observed, band };
}
