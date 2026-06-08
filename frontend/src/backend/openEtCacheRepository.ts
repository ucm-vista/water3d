import { backendConfig } from "../config/backend";
import type { OpenEtVariable } from "../config/openet";
import type { OpenEtPointTimeseriesBody } from "../api/openEt";
import { debugDataSource } from "../utils/debug";
import { getPocketBaseClient, isPocketBaseEnabled } from "./pocketbaseClient";

const LOG_SOURCE = "pocketbase-openet-cache";

export interface OpenEtCacheKeyParts {
  endpoint: string;
  request: OpenEtPointTimeseriesBody;
}

export interface OpenEtCachedVariableResponse {
  cacheKey: string;
  endpoint: string;
  variable: OpenEtVariable;
  request: OpenEtPointTimeseriesBody;
  response: unknown;
  fetchedAt: string;
}

export interface OpenEtCacheRepository {
  getVariableResponse(parts: OpenEtCacheKeyParts): Promise<OpenEtCachedVariableResponse | null>;
  saveVariableResponse(parts: OpenEtCacheKeyParts, response: unknown): Promise<void>;
}

interface OpenEtCacheRecord extends Record<string, unknown> {
  id: string;
  cacheKey: string;
  endpoint: string;
  variable: OpenEtVariable;
  request: OpenEtPointTimeseriesBody;
  response: unknown;
  fetchedAt: string;
}

export class PocketBaseOpenEtCacheRepository implements OpenEtCacheRepository {
  async getVariableResponse(parts: OpenEtCacheKeyParts): Promise<OpenEtCachedVariableResponse | null> {
    if (!isPocketBaseEnabled()) {
      debugDataSource(LOG_SOURCE, "disabled; skipping cache lookup", {
        variable: parts.request.variable,
      });
      return null;
    }

    const pb = getPocketBaseClient();
    const cacheKey = buildOpenEtCacheKey(parts);

    try {
      const record = await pb.collection(backendConfig.pocketBaseOpenEtCacheCollection).getFirstListItem<OpenEtCacheRecord>(
        pb.filter("cacheKey = {:cacheKey}", { cacheKey }),
      );

      debugDataSource(LOG_SOURCE, "cache hit", {
        cacheKey,
        variable: parts.request.variable,
      });

      return fromPocketBaseRecord(record);
    } catch (error) {
      debugDataSource(LOG_SOURCE, "cache miss", {
        cacheKey,
        variable: parts.request.variable,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async saveVariableResponse(parts: OpenEtCacheKeyParts, response: unknown): Promise<void> {
    if (!isPocketBaseEnabled()) {
      debugDataSource(LOG_SOURCE, "disabled; skipping cache save", {
        variable: parts.request.variable,
      });
      return;
    }

    const pb = getPocketBaseClient();
    const cacheKey = buildOpenEtCacheKey(parts);
    const payload = {
      cacheKey,
      endpoint: parts.endpoint,
      variable: parts.request.variable,
      model: parts.request.model,
      referenceEt: parts.request.reference_et,
      units: parts.request.units,
      version: parts.request.version,
      interval: parts.request.interval,
      lat: parts.request.geometry[1],
      lon: parts.request.geometry[0],
      startDate: parts.request.date_range[0],
      endDate: parts.request.date_range[1],
      request: parts.request,
      response,
      fetchedAt: new Date().toISOString(),
    };

    try {
      try {
        const existing = await pb.collection(backendConfig.pocketBaseOpenEtCacheCollection).getFirstListItem<OpenEtCacheRecord>(
          pb.filter("cacheKey = {:cacheKey}", { cacheKey }),
        );
        await pb.collection(backendConfig.pocketBaseOpenEtCacheCollection).update(existing.id, payload);
      } catch {
        await pb.collection(backendConfig.pocketBaseOpenEtCacheCollection).create(payload);
      }

      debugDataSource(LOG_SOURCE, "cache saved", {
        cacheKey,
        variable: parts.request.variable,
      });
    } catch (error) {
      debugDataSource(LOG_SOURCE, "cache save failed", {
        cacheKey,
        variable: parts.request.variable,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const pocketBaseOpenEtCacheRepository = new PocketBaseOpenEtCacheRepository();

export function buildOpenEtCacheKey(parts: OpenEtCacheKeyParts): string {
  const request = parts.request;

  return [
    parts.endpoint,
    request.variable,
    request.model,
    request.reference_et,
    request.units,
    request.version,
    request.interval,
    request.geometry[0].toFixed(6),
    request.geometry[1].toFixed(6),
    request.date_range[0],
    request.date_range[1],
  ].join("|");
}

function fromPocketBaseRecord(record: OpenEtCacheRecord): OpenEtCachedVariableResponse {
  return {
    cacheKey: String(record.cacheKey),
    endpoint: String(record.endpoint),
    variable: record.variable,
    request: record.request,
    response: record.response,
    fetchedAt: String(record.fetchedAt),
  };
}
