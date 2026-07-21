import { climateToolboxConfig, getClimateToolboxCfsUrl } from "../config/climate";
import { debugDataSource } from "../utils/debug";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { Coordinates, EtDataResponse, WeatherDataRequest, WeatherDataResponse } from "./contracts";
import type { WeatherRecord } from "../types/domain";
import { kelvinToCelsius, normalizeDate, percentile, toNumber } from "./toolboxShared";

type ClimateForecastVariable = "pet" | "tmmx" | "tmmn" | "pr" | "sph" | "vpd";

// The 48-member ensemble extraction is slow like gridMET's netCDF pulls and
// shares the proxy with them, so the 20s fetch default aborts real responses.
const CFS_TIMEOUT_MS = 60_000;

// Verified against the live service (2026-06): PET and precip arrive as running
// totals from the forecast start; the other variables are true daily values.
const CUMULATIVE_FORECAST_VARIABLES: Record<ClimateForecastVariable, boolean> = {
  pet: true,
  pr: true,
  tmmx: false,
  tmmn: false,
  sph: false,
  vpd: false,
};

export const climateToolboxApi = {
  enabled: climateToolboxConfig.enabled,
  urls: {
    cfsForecast: getClimateToolboxCfsUrl(),
  },
};

// The service only accepts calc-mode=all (pre-reduced modes return 500), so
// every response is a table of 48 ensemble member columns like "pet_0(mm)".
function isClimateToolboxVariableTable(record: Record<string, unknown>, variable: ClimateForecastVariable): boolean {
  return Array.isArray(record["yyyy-mm-dd"]) && Object.keys(record).some((key) => new RegExp(`^${variable}_\\d+\\(`).test(key));
}

function findVariableTables(payload: unknown, variable: ClimateForecastVariable): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => findVariableTables(item, variable));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (isClimateToolboxVariableTable(record, variable)) {
    return [record];
  }

  return Object.values(record).flatMap((value) => findVariableTables(value, variable));
}

function extractDates(record: Record<string, unknown>): string[] {
  return Array.isArray(record["yyyy-mm-dd"])
    ? record["yyyy-mm-dd"].map((date) => normalizeDate(date)).filter((date): date is string => Boolean(date))
    : [];
}

function deaccumulate(values: number[]): number[] {
  return values.map((value, index) => (index === 0 ? value : value - values[index - 1]));
}

function extractMemberSeries(record: Record<string, unknown>, variable: ClimateForecastVariable, dates: string[]): number[][] {
  const memberKeys = Object.keys(record).filter((key) => new RegExp(`^${variable}_\\d+\\(`).test(key));

  return memberKeys
    .map((key) => (Array.isArray(record[key]) ? record[key].map((value) => toNumber(value)).filter((value): value is number => typeof value === "number") : []))
    .filter((values) => values.length === dates.length)
    .map((values) => (CUMULATIVE_FORECAST_VARIABLES[variable] ? deaccumulate(values) : values));
}

function parseClimateToolboxVariableTables(
  payload: unknown,
  variable: ClimateForecastVariable,
  options: { transform?: (value: number) => number } = {},
): Array<{ date: string; value: number }> {
  return findVariableTables(payload, variable).flatMap((record) => {
    const dates = extractDates(record);
    const members = extractMemberSeries(record, variable, dates);

    return dates
      .map((date, index) => {
        const value = percentile(members.map((values) => values[index]), 0.5);
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return null;
        }

        return {
          date,
          value: Number((options.transform ? options.transform(value) : value).toFixed(3)),
        };
      })
      .filter((item): item is { date: string; value: number } => Boolean(item));
  });
}

export function parseClimateToolboxForecastPet(payload: unknown, horizonDays = climateToolboxConfig.forecastHorizonDays): EtDataResponse["records"] {
  const records: EtDataResponse["records"] = [];

  for (const record of findVariableTables(payload, "pet")) {
    const dates = extractDates(record);
    const members = extractMemberSeries(record, "pet", dates);

    dates.forEach((date, index) => {
      const memberValues = members.map((values) => values[index]).filter((value): value is number => Number.isFinite(value));
      const median = percentile(memberValues, 0.5);
      if (typeof median !== "number") {
        return;
      }

      const p10 = percentile(memberValues, 0.1);
      const p90 = percentile(memberValues, 0.9);
      const rounded = Number(median.toFixed(3));

      records.push({
        date,
        etoMm: rounded,
        etReferenceMm: rounded,
        forecastPetP10Mm: typeof p10 === "number" ? Number(p10.toFixed(3)) : undefined,
        forecastPetP90Mm: typeof p90 === "number" ? Number(p90.toFixed(3)) : undefined,
        source: "forecast",
      });
    });
  }

  return records.sort((a, b) => a.date.localeCompare(b.date)).slice(0, horizonDays);
}

function estimateRelativeHumidityFromSpecificHumidity(specificHumidityKgKg: number, tempC: number): number | undefined {
  const pressureKpa = 101.3;
  const vaporPressureKpa = (specificHumidityKgKg * pressureKpa) / (0.622 + 0.378 * specificHumidityKgKg);
  const saturationKpa = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));

  if (!Number.isFinite(vaporPressureKpa) || !Number.isFinite(saturationKpa) || saturationKpa <= 0) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Number(((vaporPressureKpa / saturationKpa) * 100).toFixed(0))));
}

function estimateDewpointFromSpecificHumidity(specificHumidityKgKg: number): number | undefined {
  const pressureKpa = 101.3;
  const vaporPressureKpa = (specificHumidityKgKg * pressureKpa) / (0.622 + 0.378 * specificHumidityKgKg);

  if (!Number.isFinite(vaporPressureKpa) || vaporPressureKpa <= 0) {
    return undefined;
  }

  const ratio = Math.log(vaporPressureKpa / 0.6108);
  return Number(((237.3 * ratio) / (17.27 - ratio)).toFixed(2));
}

function interpolateHourlyTemps(tminC: number, tmaxC: number): number[] {
  const mean = (tminC + tmaxC) / 2;
  const amplitude = (tmaxC - tminC) / 2;

  return Array.from({ length: 24 }, (_, hour) => {
    const radians = ((hour - 9) / 24) * Math.PI * 2;
    return Number((mean + amplitude * Math.sin(radians)).toFixed(2));
  });
}

export function parseClimateToolboxForecastWeather(payloads: Partial<Record<ClimateForecastVariable, unknown>>, horizonDays = climateToolboxConfig.forecastHorizonDays): WeatherRecord[] {
  const tmaxByDate = new Map(parseClimateToolboxVariableTables(payloads.tmmx, "tmmx", { transform: kelvinToCelsius }).map((row) => [row.date, row.value]));
  const tminByDate = new Map(parseClimateToolboxVariableTables(payloads.tmmn, "tmmn", { transform: kelvinToCelsius }).map((row) => [row.date, row.value]));
  const precipByDate = new Map(parseClimateToolboxVariableTables(payloads.pr, "pr").map((row) => [row.date, row.value]));
  const humidityByDate = new Map(parseClimateToolboxVariableTables(payloads.sph, "sph").map((row) => [row.date, row.value]));
  const vpdByDate = new Map(parseClimateToolboxVariableTables(payloads.vpd, "vpd").map((row) => [row.date, row.value]));
  const petRecordsByDate = new Map(parseClimateToolboxForecastPet(payloads.pet, horizonDays).map((record) => [record.date, record]));
  const dates = [...new Set([...tmaxByDate.keys(), ...tminByDate.keys(), ...precipByDate.keys(), ...humidityByDate.keys(), ...petRecordsByDate.keys()])].sort();

  const records: WeatherRecord[] = [];

  for (const date of dates) {
    const tmaxC = tmaxByDate.get(date);
    const tminC = tminByDate.get(date);
    const petRecord = petRecordsByDate.get(date);
    const etoMm = petRecord?.etoMm ?? petRecord?.etReferenceMm;

    if (typeof tmaxC !== "number" || typeof tminC !== "number" || typeof etoMm !== "number") {
      continue;
    }

    const tMeanC = (tmaxC + tminC) / 2;
    const specificHumidity = humidityByDate.get(date) ?? Number.NaN;
    const rhMean = estimateRelativeHumidityFromSpecificHumidity(specificHumidity, tMeanC);

    records.push({
      date,
      tminC,
      tmaxC,
      precipMm: precipByDate.get(date) ?? 0,
      etoMm,
      forecastPetP10Mm: petRecord?.forecastPetP10Mm,
      forecastPetP90Mm: petRecord?.forecastPetP90Mm,
      source: "forecast",
      rhMin: rhMean,
      rhMax: rhMean,
      tdewC: estimateDewpointFromSpecificHumidity(specificHumidity),
      vpdKpa: vpdByDate.get(date),
      hourlyTempsC: interpolateHourlyTemps(tminC, tmaxC),
    });
  }

  return records.slice(0, horizonDays);
}

export class ClimateToolboxProvider {
  private buildForecastUrl(variable: ClimateForecastVariable): URL {
    const url = new URL(climateToolboxApi.urls.cfsForecast, window.location.origin);
    url.searchParams.set("decimal-precision", climateToolboxConfig.defaultDecimalPrecision);
    url.searchParams.set("calc-mode", "all");
    url.searchParams.set("positive-east-longitude", "False");
    url.searchParams.set("request-JSON", "True");
    url.searchParams.set("variable", variable);
    return url;
  }

  private async fetchForecastVariable(variable: ClimateForecastVariable, location: Coordinates): Promise<unknown> {
    const url = this.buildForecastUrl(variable);
    url.searchParams.set("lat", String(location.lat));
    url.searchParams.set("lon", String(location.lon));

    const response = await fetchWithTimeout(url.toString(), {}, CFS_TIMEOUT_MS);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Climate Toolbox ${variable} forecast request failed with ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`);
    }

    const payload = (await response.json()) as unknown;
    debugDataSource("climate-toolbox", `raw forecast ${variable} response`, {
      payload,
      requestUrl: url.toString(),
    });
    return payload;
  }

  async getForecastWeather(request: WeatherDataRequest): Promise<WeatherDataResponse> {
    if (!climateToolboxApi.enabled) {
      throw new Error("Climate Toolbox is not enabled.");
    }

    const [pet, tmmx, tmmn, pr, sph, vpd] = await Promise.all([
      this.fetchForecastVariable("pet", request),
      this.fetchForecastVariable("tmmx", request),
      this.fetchForecastVariable("tmmn", request),
      this.fetchForecastVariable("pr", request),
      this.fetchForecastVariable("sph", request),
      this.fetchForecastVariable("vpd", request),
    ]);
    const forecastRecords = parseClimateToolboxForecastWeather({ pet, tmmx, tmmn, pr, sph, vpd });

    if (!forecastRecords.length) {
      throw new Error("Climate Toolbox did not return usable forecast weather records.");
    }

    return {
      records: [],
      forecastRecords,
      metadata: {
        provider: "climate",
        generatedAt: new Date().toISOString(),
        sourceUrl: climateToolboxApi.urls.cfsForecast,
      },
    };
  }
}

export const climateToolboxProvider = new ClimateToolboxProvider();
