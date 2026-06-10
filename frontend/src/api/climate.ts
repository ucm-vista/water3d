import { climateToolboxConfig, getClimateToolboxCfsUrl } from "../config/climate";
import { debugDataSource } from "../utils/debug";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { Coordinates, EtDataResponse, WeatherDataRequest, WeatherDataResponse } from "./contracts";
import type { WeatherRecord } from "../types/domain";

export interface ClimateToolboxForecastPetRequest extends Coordinates {
  horizonDays?: number;
}

type ClimateForecastVariable = "pet" | "tmmx" | "tmmn" | "pr" | "sph";

export const climateToolboxApi = {
  enabled: climateToolboxConfig.enabled,
  urls: {
    cfsForecast: getClimateToolboxCfsUrl(),
  },
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }

  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  return undefined;
}

function average(values: number[]): number | undefined {
  if (!values.length) {
    return undefined;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function extractNumericValues(value: unknown): number[] {
  const numeric = toNumber(value);
  if (typeof numeric === "number") {
    return [numeric];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractNumericValues(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const preferred = [
    record.pet,
    record.PET,
    record.value,
    record.mean,
    record.average,
    record.ensemble_mean,
    record.ensembleMean,
    record.values,
    record.members,
  ].flatMap((candidate) => extractNumericValues(candidate));

  if (preferred.length) {
    return preferred;
  }

  return Object.entries(record)
    .filter(([key]) => !/date|time|lat|lon|longitude|latitude/i.test(key))
    .flatMap(([, candidate]) => extractNumericValues(candidate));
}

function collectDatedValues(payload: unknown, rows = new Map<string, number[]>()) {
  if (!payload || typeof payload !== "object") {
    return rows;
  }

  if (Array.isArray(payload)) {
    payload.forEach((item) => collectDatedValues(item, rows));
    return rows;
  }

  const record = payload as Record<string, unknown>;
  const date =
    normalizeDate(record.date) ??
    normalizeDate(record.Date) ??
    normalizeDate(record.time) ??
    normalizeDate(record.datetime) ??
    normalizeDate(record.day) ??
    normalizeDate(record.forecast_date);

  if (date) {
    const values = extractNumericValues(record);
    if (values.length) {
      rows.set(date, [...(rows.get(date) ?? []), ...values]);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    const keyedDate = normalizeDate(key);
    if (keyedDate) {
      const values = extractNumericValues(value);
      if (values.length) {
        rows.set(keyedDate, [...(rows.get(keyedDate) ?? []), ...values]);
      }
    } else if (value && typeof value === "object") {
      collectDatedValues(value, rows);
    }
  }

  return rows;
}

function isClimateToolboxPetTable(record: Record<string, unknown>): boolean {
  return Array.isArray(record["yyyy-mm-dd"]) && Object.keys(record).some((key) => /^pet_(?:\d+|50p)\(mm\)$/.test(key));
}

function isClimateToolboxVariableTable(record: Record<string, unknown>, variable: ClimateForecastVariable): boolean {
  return Array.isArray(record["yyyy-mm-dd"]) && Object.keys(record).some((key) => new RegExp(`^${variable}_(?:\\d+|50p)\\(`).test(key));
}

function valuesToDaily(values: number[]): number[] {
  const isCumulative = values.length > 1 && values.every((value, index) => index === 0 || value >= values[index - 1]);

  if (!isCumulative) {
    return values;
  }

  return values.map((value, index) => (index === 0 ? value : value - values[index - 1]));
}

function parseClimateToolboxPetTable(record: Record<string, unknown>): EtDataResponse["records"] {
  const dates = Array.isArray(record["yyyy-mm-dd"])
    ? record["yyyy-mm-dd"].map((date) => normalizeDate(date)).filter((date): date is string => Boolean(date))
    : [];

  if (!dates.length) {
    return [];
  }

  const medianValues = Array.isArray(record["pet_50p(mm)"]) ? record["pet_50p(mm)"].map((value) => toNumber(value)) : [];
  const p10Values = Array.isArray(record["pet_10p(mm)"]) ? record["pet_10p(mm)"].map((value) => toNumber(value)) : [];
  const p90Values = Array.isArray(record["pet_90p(mm)"]) ? record["pet_90p(mm)"].map((value) => toNumber(value)) : [];
  const hasMedian = medianValues.filter((value): value is number => typeof value === "number").length === dates.length;
  const hasP10 = p10Values.filter((value): value is number => typeof value === "number").length === dates.length;
  const hasP90 = p90Values.filter((value): value is number => typeof value === "number").length === dates.length;

  if (hasMedian) {
    const dailyP10Values = hasP10 ? valuesToDaily(p10Values as number[]) : [];
    const dailyP90Values = hasP90 ? valuesToDaily(p90Values as number[]) : [];

    return valuesToDaily(medianValues as number[])
      .slice(0, dates.length)
      .map((etoMm, index) => {
        const rounded = Number(etoMm.toFixed(3));
        return {
          date: dates[index],
          etoMm: rounded,
          etReferenceMm: rounded,
          forecastPetP10Mm: typeof dailyP10Values[index] === "number" ? Number(dailyP10Values[index].toFixed(3)) : undefined,
          forecastPetP90Mm: typeof dailyP90Values[index] === "number" ? Number(dailyP90Values[index].toFixed(3)) : undefined,
          source: "forecast" as const,
        };
      });
  }

  const ensembleKeys = Object.keys(record).filter((key) => /^pet_\d+\(mm\)$/.test(key));
  const ensembleDailyValues = ensembleKeys
    .map((key) => (Array.isArray(record[key]) ? record[key].map((value) => toNumber(value)).filter((value): value is number => typeof value === "number") : []))
    .filter((values) => values.length === dates.length)
    .map((values) => valuesToDaily(values));

  const records: EtDataResponse["records"] = [];

  dates.forEach((date, index) => {
    const etoMm = average(ensembleDailyValues.map((values) => values[index]).filter((value): value is number => typeof value === "number"));
    if (typeof etoMm !== "number") {
      return;
    }

    const rounded = Number(etoMm.toFixed(3));
    records.push({
      date,
      etoMm: rounded,
      etReferenceMm: rounded,
      source: "forecast",
    });
  });

  return records;
}

function extractDates(record: Record<string, unknown>): string[] {
  return Array.isArray(record["yyyy-mm-dd"])
    ? record["yyyy-mm-dd"].map((date) => normalizeDate(date)).filter((date): date is string => Boolean(date))
    : [];
}

function extractMedianOrEnsembleValues(record: Record<string, unknown>, variable: ClimateForecastVariable, dates: string[]): number[] {
  const medianKey = Object.keys(record).find((key) => new RegExp(`^${variable}_50p\\(`).test(key));
  const medianValues = medianKey && Array.isArray(record[medianKey]) ? record[medianKey].map((value) => toNumber(value)) : [];
  const hasMedian = medianValues.filter((value): value is number => typeof value === "number").length === dates.length;

  if (hasMedian) {
    return medianValues as number[];
  }

  const ensembleKeys = Object.keys(record).filter((key) => new RegExp(`^${variable}_\\d+\\(`).test(key));
  const ensembleValues = ensembleKeys
    .map((key) => (Array.isArray(record[key]) ? record[key].map((value) => toNumber(value)).filter((value): value is number => typeof value === "number") : []))
    .filter((values) => values.length === dates.length);

  return dates.map((_, index) => average(ensembleValues.map((values) => values[index]).filter((value): value is number => typeof value === "number")) ?? Number.NaN);
}

function parseClimateToolboxVariableTables(
  payload: unknown,
  variable: ClimateForecastVariable,
  options: { cumulative?: boolean; transform?: (value: number) => number } = {},
): Array<{ date: string; value: number }> {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => parseClimateToolboxVariableTables(item, variable, options));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (!isClimateToolboxVariableTable(record, variable)) {
    return Object.values(record).flatMap((value) => parseClimateToolboxVariableTables(value, variable, options));
  }

  const dates = extractDates(record);
  const rawValues = extractMedianOrEnsembleValues(record, variable, dates);
  const values = options.cumulative ? valuesToDaily(rawValues) : rawValues;

  return dates
    .map((date, index) => {
      const value = values[index];
      if (!Number.isFinite(value)) {
        return null;
      }

      return {
        date,
        value: Number((options.transform ? options.transform(value) : value).toFixed(3)),
      };
    })
    .filter((item): item is { date: string; value: number } => Boolean(item));
}

function parseClimateToolboxPetTables(payload: unknown): EtDataResponse["records"] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => parseClimateToolboxPetTables(item));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (isClimateToolboxPetTable(record)) {
    return parseClimateToolboxPetTable(record);
  }

  return Object.values(record).flatMap((value) => parseClimateToolboxPetTables(value));
}

export function parseClimateToolboxForecastPet(payload: unknown, horizonDays = climateToolboxConfig.forecastHorizonDays): EtDataResponse["records"] {
  const tableRecords = parseClimateToolboxPetTables(payload);
  if (tableRecords.length) {
    return tableRecords.sort((a, b) => a.date.localeCompare(b.date)).slice(0, horizonDays);
  }

  const records: EtDataResponse["records"] = [];

  for (const [date, values] of collectDatedValues(payload).entries()) {
      const etoMm = average(values);
    if (typeof etoMm !== "number") {
      continue;
    }

    const rounded = Number(etoMm.toFixed(3));
    records.push({
      date,
      etoMm: rounded,
      etReferenceMm: rounded,
      source: "forecast",
    });
  }

  return records.sort((a, b) => a.date.localeCompare(b.date)).slice(0, horizonDays);
}

function kelvinToCelsius(value: number): number {
  return value - 273.15;
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
  const precipByDate = new Map(parseClimateToolboxVariableTables(payloads.pr, "pr", { cumulative: true }).map((row) => [row.date, row.value]));
  const humidityByDate = new Map(parseClimateToolboxVariableTables(payloads.sph, "sph").map((row) => [row.date, row.value]));
  const petRecordsByDate = new Map(parseClimateToolboxForecastPet(payloads.pet, horizonDays).map((record) => [record.date, record]));
  const petByDate = new Map([...petRecordsByDate.values()].map((record) => [record.date, record.etoMm ?? record.etReferenceMm ?? 0]));
  const dates = [...new Set([...tmaxByDate.keys(), ...tminByDate.keys(), ...precipByDate.keys(), ...humidityByDate.keys(), ...petByDate.keys()])].sort();

  const records: WeatherRecord[] = [];

  for (const date of dates) {
    const tmaxC = tmaxByDate.get(date);
    const tminC = tminByDate.get(date);
    const etoMm = petByDate.get(date);
    const petRecord = petRecordsByDate.get(date);

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

    const response = await fetchWithTimeout(url.toString());
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

  async getForecastPet(request: ClimateToolboxForecastPetRequest): Promise<EtDataResponse> {
    if (!climateToolboxApi.enabled) {
      throw new Error("Climate Toolbox is not enabled.");
    }

    const payload = await this.fetchForecastVariable("pet", request);
    const records = parseClimateToolboxForecastPet(payload, request.horizonDays);

    if (!records.length) {
      throw new Error("Climate Toolbox did not return usable PET forecast records.");
    }

    return {
      records,
      metadata: {
        provider: "climate",
        generatedAt: new Date().toISOString(),
        sourceUrl: climateToolboxApi.urls.cfsForecast,
      },
    };
  }

  async getForecastWeather(request: WeatherDataRequest): Promise<WeatherDataResponse> {
    if (!climateToolboxApi.enabled) {
      throw new Error("Climate Toolbox is not enabled.");
    }

    const [pet, tmmx, tmmn, pr, sph] = await Promise.all([
      this.fetchForecastVariable("pet", request),
      this.fetchForecastVariable("tmmx", request),
      this.fetchForecastVariable("tmmn", request),
      this.fetchForecastVariable("pr", request),
      this.fetchForecastVariable("sph", request),
    ]);
    const forecastRecords = parseClimateToolboxForecastWeather({ pet, tmmx, tmmn, pr, sph });

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
