import { getGridMetDataPath, getGridMetNetcdfUrl, gridMetConfig, gridMetVariables, type GridMetVariableCode } from "../config/gridmet";
import type { WeatherRecord } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { WeatherDataRequest, WeatherDataResponse } from "./contracts";
import { kelvinToCelsius, normalizeDate, toNumber } from "./toolboxShared";

export const gridMetApi = {
  enabled: gridMetConfig.enabled,
  urls: {
    netcdfData: getGridMetNetcdfUrl(),
  },
};

// Response caching (in-memory + localStorage) now lives in the TanStack Query
// layer (src/api/queries/), which owns TTL/freshness. Here we keep only
// in-flight dedupe so concurrent identical pulls coalesce into one request.
const gridMetInFlightRequests = new Map<string, Promise<WeatherDataResponse>>();

export type GridMetSeriesByVariable = Partial<Record<GridMetVariableCode, Array<{ date: string; value: number }>>>;

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function findSeriesTables(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => findSeriesTables(item));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record["yyyy-mm-dd"])) {
    return [record];
  }

  return Object.values(record).flatMap((value) => findSeriesTables(value));
}

export function parseGridMetSeries(payload: unknown, variable: GridMetVariableCode): Array<{ date: string; value: number }> {
  const { longName, kelvin } = gridMetVariables[variable];

  return findSeriesTables(payload).flatMap((table) => {
    const dates = (table["yyyy-mm-dd"] as unknown[]).map((date) => normalizeDate(date));
    const valueKey = Object.keys(table).find((key) => key === longName || key.startsWith(`${longName}(`));
    const rawValues = valueKey && Array.isArray(table[valueKey]) ? (table[valueKey] as unknown[]) : [];

    return dates
      .map((date, index) => {
        const value = toNumber(rawValues[index]);
        if (!date || typeof value !== "number") {
          return null;
        }

        return { date, value: round(kelvin ? kelvinToCelsius(value) : value) };
      })
      .filter((row): row is { date: string; value: number } => row !== null);
  });
}

export function buildGridMetWeatherRecords(seriesByVariable: GridMetSeriesByVariable, options: { requireEto?: boolean } = {}): WeatherRecord[] {
  const { requireEto = true } = options;
  const byVariable = new Map<GridMetVariableCode, Map<string, number>>();
  for (const [variable, rows] of Object.entries(seriesByVariable) as Array<[GridMetVariableCode, Array<{ date: string; value: number }>]>) {
    byVariable.set(variable, new Map(rows.map((row) => [row.date, row.value])));
  }

  const lookup = (variable: GridMetVariableCode, date: string) => byVariable.get(variable)?.get(date);
  const dates = [...new Set([...byVariable.values()].flatMap((rows) => [...rows.keys()]))].sort();

  const records: WeatherRecord[] = [];

  for (const date of dates) {
    const tminC = lookup("tmmn", date);
    const tmaxC = lookup("tmmx", date);
    const etoMm = lookup("pet", date);

    if (typeof tminC !== "number" || typeof tmaxC !== "number" || (requireEto && typeof etoMm !== "number")) {
      continue;
    }

    records.push({
      date,
      tminC,
      tmaxC,
      precipMm: lookup("pr", date) ?? 0,
      etoMm: etoMm ?? 0,
      source: "historical",
      rhMin: lookup("rmin", date),
      rhMax: lookup("rmax", date),
      vpdKpa: lookup("vpd", date),
    });
  }

  return records;
}

// gridMET silently truncates ranges that extend past its ~2-day data lag, so
// callers must learn the actual tail from the response rather than assume the
// requested end date came back.
export function buildGridMetQualityFlags(records: WeatherRecord[], requestedEndDate: string): string[] {
  const lastDate = records.at(-1)?.date;

  if (lastDate && lastDate < requestedEndDate) {
    return [`data-available-through:${lastDate}`];
  }

  return [];
}

export function getGridMetAvailableThrough(qualityFlags: string[] | undefined): string | undefined {
  return qualityFlags?.find((flag) => flag.startsWith("data-available-through:"))?.slice("data-available-through:".length);
}

// Each variable is its own request against a slow netCDF-extraction service
// (a full-year pull takes 12-16s on its own), so request sets stay minimal
// per profile and the timeout is far above the fetch default.
const GRIDMET_TIMEOUT_MS = 90_000;

const VARIABLE_PROFILES: Record<"full" | "temperature" | "temperature_et" | "climatology", { required: GridMetVariableCode[]; optional: GridMetVariableCode[] }> = {
  full: { required: ["tmmn", "tmmx", "pet"], optional: ["pr", "rmax", "rmin", "vpd"] },
  temperature: { required: ["tmmn", "tmmx"], optional: [] },
  // Temps + reference ET (pet) for the year-over-year overlays: GDD needs the
  // temperatures, the ET view needs reference ETo. One extra request per year
  // versus "temperature", without the humidity/precip/vpd of the "full" pull.
  temperature_et: { required: ["tmmn", "tmmx", "pet"], optional: [] },
  // 30-year normal computation: temps + ETo + precip over a multi-decade range.
  // gridMET serves each variable from one aggregated 1979→present file, so the
  // whole window is still a single request per variable.
  climatology: { required: ["tmmn", "tmmx", "pet"], optional: ["pr"] },
};

export class GridMetProvider {
  private buildVariableUrl(variable: GridMetVariableCode, request: WeatherDataRequest): URL {
    const { longName } = gridMetVariables[variable];
    const url = new URL(gridMetApi.urls.netcdfData, window.location.origin);
    url.searchParams.set("decimal-precision", gridMetConfig.defaultDecimalPrecision);
    url.searchParams.set("lat", String(request.lat));
    url.searchParams.set("lon", String(request.lon));
    url.searchParams.set("positive-east-longitude", "False");
    url.searchParams.set("request-JSON", "True");
    url.searchParams.set("data-path", getGridMetDataPath(variable));
    url.searchParams.set("variable", longName);
    url.searchParams.set("variable-name", longName);
    url.searchParams.set("start-date", request.startDate);
    url.searchParams.set("end-date", request.endDate);
    return url;
  }

  private async fetchVariableSeries(variable: GridMetVariableCode, request: WeatherDataRequest): Promise<Array<{ date: string; value: number }>> {
    const url = this.buildVariableUrl(variable, request);
    const response = await fetchWithTimeout(url.toString(), {}, GRIDMET_TIMEOUT_MS);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`gridMET ${variable} request failed with ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`);
    }

    const payload = (await response.json()) as unknown;
    debugDataSource("gridmet", `raw ${variable} history response`, {
      payload,
      requestUrl: url.toString(),
    });

    return parseGridMetSeries(payload, variable);
  }

  async getDailyWeather(request: WeatherDataRequest): Promise<WeatherDataResponse> {
    if (!gridMetApi.enabled) {
      throw new Error("gridMET historical weather is not enabled.");
    }

    const cacheKey = JSON.stringify({
      lat: Number(request.lat.toFixed(6)),
      lon: Number(request.lon.toFixed(6)),
      startDate: request.startDate,
      endDate: request.endDate,
      variableProfile: request.variableProfile ?? "full",
    });

    const inFlight = gridMetInFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.fetchDailyWeather(request).finally(() => {
      gridMetInFlightRequests.delete(cacheKey);
    });

    gridMetInFlightRequests.set(cacheKey, promise);
    return promise;
  }

  private async fetchDailyWeather(request: WeatherDataRequest): Promise<WeatherDataResponse> {
    const profile = VARIABLE_PROFILES[request.variableProfile ?? "full"];
    const variables = [...profile.required, ...profile.optional];
    const results = await Promise.allSettled(variables.map((variable) => this.fetchVariableSeries(variable, request)));

    const seriesByVariable: GridMetSeriesByVariable = {};
    const failures: string[] = [];
    const missingOptional: GridMetVariableCode[] = [];

    results.forEach((result, index) => {
      const variable = variables[index];
      if (result.status === "fulfilled" && result.value.length) {
        seriesByVariable[variable] = result.value;
      } else if (profile.required.includes(variable)) {
        failures.push(result.status === "rejected" ? (result.reason instanceof Error ? result.reason.message : String(result.reason)) : `gridMET ${variable} returned no records.`);
      } else {
        // Optional variables (e.g. pr) default to 0 in the built records, which
        // is indistinguishable from a genuinely dry day — flag the gap so the
        // UI can warn instead of silently charting zeros.
        missingOptional.push(variable);
      }
    });

    if (failures.length) {
      throw new Error(`gridMET returned no usable weather records: ${failures.join("; ")}`);
    }

    const records = buildGridMetWeatherRecords(seriesByVariable, { requireEto: profile.required.includes("pet") });
    if (!records.length) {
      throw new Error("gridMET did not return usable historical weather records.");
    }

    return {
      records,
      metadata: {
        provider: "gridmet",
        generatedAt: new Date().toISOString(),
        sourceUrl: gridMetApi.urls.netcdfData,
        qualityFlags: [
          ...buildGridMetQualityFlags(records, request.endDate),
          ...missingOptional.map((variable) => `missing-variable:${variable}`),
        ],
      },
    };
  }
}

export const gridMetProvider = new GridMetProvider();
