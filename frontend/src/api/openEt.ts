import { getOpenEtUrl, getOpenEtVariableVersion, openEtConfig, openEtVariables, type OpenEtInterval, type OpenEtVariable } from "../config/openet";
import type { Coordinates, EtDataRequest, EtDataResponse, EtDataVariable, EtProvider } from "./contracts";
import { pocketBaseOpenEtCacheRepository } from "../backend/openEtCacheRepository";

export interface OpenEtPointTimeseriesRequest extends Coordinates {
  startDate: string;
  endDate: string;
  variable: OpenEtVariable;
  interval?: OpenEtInterval;
}

export interface OpenEtPointTimeseriesBody {
  date_range: [string, string];
  interval: OpenEtInterval;
  geometry: [number, number];
  model: string;
  variable: OpenEtVariable;
  reference_et: string;
  units: string;
  version: number;
  file_format: "JSON";
}

export type OpenEtLoadStage =
  | "cache-check-start"
  | "cache-hit"
  | "cache-miss"
  | "openet-fetch-start"
  | "openet-fetch-success"
  | "cache-save-start"
  | "cache-save-complete";

export interface OpenEtLoadEvent {
  stage: OpenEtLoadStage;
  variable: OpenEtVariable;
}

export type OpenEtLoadObserver = (event: OpenEtLoadEvent) => void;

export function buildOpenEtPointTimeseriesBody(request: OpenEtPointTimeseriesRequest): OpenEtPointTimeseriesBody {
  return {
    date_range: [request.startDate, request.endDate],
    interval: request.interval ?? openEtConfig.defaultInterval,
    geometry: [request.lon, request.lat],
    model: openEtConfig.defaultModel,
    variable: request.variable,
    reference_et: openEtConfig.defaultReferenceEt,
    units: openEtConfig.defaultUnits,
    version: getOpenEtVariableVersion(request.variable),
    file_format: "JSON",
  };
}

export const openEtApi = {
  enabled: openEtConfig.enabled && Boolean(openEtConfig.token),
  urls: {
    accountStatus: getOpenEtUrl("accountStatus"),
    pointTimeseries: getOpenEtUrl("rasterPointTimeseries"),
    polygonTimeseries: getOpenEtUrl("rasterPolygonTimeseries"),
    rasterMetadata: getOpenEtUrl("rasterMetadata"),
  },
  headers: {
    accept: "application/json",
    authorization: openEtConfig.token,
  },
  water3dVariables: openEtVariables.filter((variable) =>
    ([...openEtConfig.variables.requiredForWater3d, ...openEtConfig.variables.optionalForWater3d] as OpenEtVariable[]).includes(variable.variable)
  ),
};

export function toOpenEtVariable(variable: EtDataVariable): OpenEtVariable {
  return variable;
}

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

  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function getSupportedOpenEtDateRange(request: EtDataRequest): { startDate: string; endDate: string } {
  const maxAvailableDate = openEtConfig.maxAvailableDate;

  if (!maxAvailableDate) {
    return {
      startDate: request.startDate,
      endDate: request.endDate,
    };
  }

  if (compareIsoDate(request.startDate, maxAvailableDate) > 0) {
    throw new Error(`OpenET data is currently configured through ${maxAvailableDate}; requested range starts ${request.startDate}.`);
  }

  return {
    startDate: request.startDate,
    endDate: compareIsoDate(request.endDate, maxAvailableDate) > 0 ? maxAvailableDate : request.endDate,
  };
}

function extractSeriesRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.data, record.results, record.time_series, record.timeseries, record.features];

  for (const candidate of candidates) {
    const rows = extractSeriesRows(candidate);
    if (rows.length) {
      return rows;
    }
  }

  return [];
}

function extractSeriesValue(row: Record<string, unknown>, variable: OpenEtVariable): { date?: string; value?: number } {
  const date = normalizeDate(row.date ?? row.time ?? row.datetime ?? row.start_date ?? row.Date);
  const value =
    toNumber(row[variable]) ??
    toNumber(row.value) ??
    toNumber(row.mean) ??
    toNumber(row[variable.toLowerCase()]) ??
    toNumber(row.properties && typeof row.properties === "object" ? (row.properties as Record<string, unknown>)[variable] : undefined);

  return { date, value };
}

const openEtResponseCache = new Map<string, EtDataResponse>();
const openEtInFlightRequests = new Map<string, Promise<EtDataResponse>>();

function buildOpenEtRequestKey(request: EtDataRequest, dateRange: { startDate: string; endDate: string }, variables: OpenEtVariable[]): string {
  return JSON.stringify({
    cropId: request.cropId,
    fieldId: request.fieldId,
    lat: Number(request.lat.toFixed(6)),
    lon: Number(request.lon.toFixed(6)),
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    interval: openEtConfig.defaultInterval,
    model: openEtConfig.defaultModel,
    referenceEt: openEtConfig.defaultReferenceEt,
    units: openEtConfig.defaultUnits,
    variables,
  });
}

export class OpenEtProvider implements EtProvider {
  async getEtData(request: EtDataRequest, onLoadEvent?: OpenEtLoadObserver): Promise<EtDataResponse> {
    if (!openEtApi.enabled) {
      throw new Error("OpenET is not enabled.");
    }

    const variables = openEtConfig.variables.requiredForWater3d;
    const dateRange = getSupportedOpenEtDateRange(request);
    const requestKey = buildOpenEtRequestKey(request, dateRange, variables);
    const cached = openEtResponseCache.get(requestKey);

    if (cached) {
      return cached;
    }

    const inFlight = openEtInFlightRequests.get(requestKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.fetchEtData(request, dateRange, variables, onLoadEvent)
      .then((response) => {
        openEtResponseCache.set(requestKey, response);
        return response;
      })
      .finally(() => {
        openEtInFlightRequests.delete(requestKey);
      });

    openEtInFlightRequests.set(requestKey, promise);
    return promise;
  }

  private async fetchEtData(
    request: EtDataRequest,
    dateRange: { startDate: string; endDate: string },
    variables: OpenEtVariable[],
    onLoadEvent?: OpenEtLoadObserver,
  ): Promise<EtDataResponse> {
    const responses = await Promise.allSettled(
      variables.map(async (variable) => {
        const requestBody = buildOpenEtPointTimeseriesBody({
          ...request,
          ...dateRange,
          variable,
        });
        const cacheParts = {
          endpoint: openEtApi.urls.pointTimeseries,
          request: requestBody,
        };
        onLoadEvent?.({ stage: "cache-check-start", variable });
        const cached = await pocketBaseOpenEtCacheRepository.getVariableResponse(cacheParts);

        if (cached) {
          onLoadEvent?.({ stage: "cache-hit", variable });
          return {
            variable,
            payload: cached.response,
          };
        }

        onLoadEvent?.({ stage: "cache-miss", variable });
        onLoadEvent?.({ stage: "openet-fetch-start", variable });
        const response = await fetch(openEtApi.urls.pointTimeseries, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: openEtApi.headers.accept,
            Authorization: openEtApi.headers.authorization,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(`OpenET ${variable} request failed with ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`);
        }

        const payload = (await response.json()) as unknown;
        onLoadEvent?.({ stage: "openet-fetch-success", variable });
        onLoadEvent?.({ stage: "cache-save-start", variable });
        await pocketBaseOpenEtCacheRepository.saveVariableResponse(cacheParts, payload);
        onLoadEvent?.({ stage: "cache-save-complete", variable });

        return {
          variable,
          payload,
        };
      }),
    );

    const byDate = new Map<string, NonNullable<EtDataResponse["records"][number]>>();

    for (const result of responses) {
      if (result.status === "rejected") {
        continue;
      }

      const { variable, payload } = result.value;
      for (const row of extractSeriesRows(payload)) {
        const { date, value } = extractSeriesValue(row, variable);
        if (!date || typeof value !== "number") {
          continue;
        }

        const record = byDate.get(date) ?? { date, source: "historical" as const };

        if (variable === "ET") {
          record.etActualMm = value;
        } else if (variable === "ETo") {
          record.etoMm = value;
          record.etReferenceMm = value;
        } else if (variable === "PR") {
          record.precipMm = value;
        }

        byDate.set(date, record);
      }
    }

    if (!byDate.size) {
      throw new Error("OpenET did not return usable ET records for this field/date range.");
    }

    return {
      records: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      metadata: {
        provider: "openet",
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export const openEtProvider = new OpenEtProvider();
