import { getSoilDataAccessUrl, soilDataAccessConfig } from "../config/soil";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { Coordinates, FieldSetupContext, LocationProvider, LocationSearchResult } from "./contracts";

export interface SoilDetectionRequest extends Coordinates {
  rootZoneDepthCm?: number;
}

export interface SoilDetectionRow {
  mukey: string;
  mapUnitName: string;
  componentName: string;
  componentPercent: number | null;
  surfaceTexture: string | null;
  hydrologicGroup: string | null;
  drainageClass: string | null;
  awhcMmPerM: number | null;
}

export interface SoilDetectionResponse {
  rows: SoilDetectionRow[];
  metadata: {
    provider: "nrcs-soil-data-access";
    queryFormat: typeof soilDataAccessConfig.format;
  };
}

export interface SoilDataAccessPostBody {
  service: "query";
  request: "query";
  format: typeof soilDataAccessConfig.format;
  query: string;
}

const DEFAULT_ROOT_ZONE_DEPTH_CM = 100;

function clampCoordinate(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Soil detection coordinates must be finite numbers.");
  }

  return Math.min(Math.max(value, min), max);
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export function buildSoilDetectionQuery(request: SoilDetectionRequest) {
  const lon = formatCoordinate(clampCoordinate(request.lon, -180, 180));
  const lat = formatCoordinate(clampCoordinate(request.lat, -90, 90));
  const rootZoneDepthCm = Math.max(1, Math.round(request.rootZoneDepthCm ?? DEFAULT_ROOT_ZONE_DEPTH_CM));

  return `
SELECT TOP 5
  mu.mukey,
  mu.muname AS map_unit_name,
  co.compname AS component_name,
  co.comppct_r AS component_percent,
  surface.surface_texture,
  co.hydgrp AS hydrologic_group,
  co.drainagecl AS drainage_class,
  CAST(weighted.awc_mm_per_m AS decimal(8, 1)) AS awhc_mm_per_m
FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon} ${lat})') AS point_mukey
INNER JOIN mapunit AS mu ON mu.mukey = point_mukey.mukey
INNER JOIN component AS co ON co.mukey = mu.mukey
OUTER APPLY (
  SELECT TOP 1 COALESCE(ct.texcl, ctg.texdesc) AS surface_texture
  FROM chorizon AS ch
  INNER JOIN chtexturegrp AS ctg ON ctg.chkey = ch.chkey
  LEFT JOIN chtexture AS ct ON ct.chtgkey = ctg.chtgkey
  WHERE ch.cokey = co.cokey
    AND (ctg.rvindicator = 'Yes' OR ctg.rvindicator IS NULL)
  ORDER BY ch.hzdept_r ASC
) AS surface
OUTER APPLY (
  SELECT
    CASE
      WHEN SUM(CASE WHEN ch.awc_r IS NULL THEN 0 ELSE (IIF(ch.hzdepb_r > ${rootZoneDepthCm}, ${rootZoneDepthCm}, ch.hzdepb_r) - ch.hzdept_r) END) = 0
        THEN NULL
      ELSE
        SUM(
          ch.awc_r *
          (IIF(ch.hzdepb_r > ${rootZoneDepthCm}, ${rootZoneDepthCm}, ch.hzdepb_r) - ch.hzdept_r)
        ) /
        SUM(CASE WHEN ch.awc_r IS NULL THEN 0 ELSE (IIF(ch.hzdepb_r > ${rootZoneDepthCm}, ${rootZoneDepthCm}, ch.hzdepb_r) - ch.hzdept_r) END) *
        1000
    END AS awc_mm_per_m
  FROM chorizon AS ch
  WHERE ch.cokey = co.cokey
    AND ch.hzdept_r < ${rootZoneDepthCm}
    AND ch.hzdepb_r > ch.hzdept_r
) AS weighted
WHERE co.comppct_r IS NOT NULL
ORDER BY co.majcompflag DESC, co.comppct_r DESC;
`.trim();
}

export function buildSoilDetectionPostBody(request: SoilDetectionRequest): SoilDataAccessPostBody {
  return {
    service: "query",
    request: "query",
    format: soilDataAccessConfig.format,
    query: buildSoilDetectionQuery(request),
  };
}

export const soilDataAccessApi = {
  enabled: soilDataAccessConfig.enabled,
  url: getSoilDataAccessUrl(),
  format: soilDataAccessConfig.format,
};

function parseSdaTable(payload: unknown): string[][] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const table = (payload as Record<string, unknown>).Table;
  return Array.isArray(table) ? table.filter((row): row is string[] => Array.isArray(row)) : [];
}

function cell(row: unknown[], index: number): string | null {
  const value = row[index];
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

function numberCell(row: unknown[], index: number): number | null {
  const value = cell(row, index);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSoilDetectionResponse(payload: unknown): SoilDetectionResponse {
  const table = parseSdaTable(payload);
  const rows = table.slice(1).map((row) => ({
    mukey: cell(row, 0) ?? "",
    mapUnitName: cell(row, 1) ?? "Unknown map unit",
    componentName: cell(row, 2) ?? "Unknown component",
    componentPercent: numberCell(row, 3),
    surfaceTexture: cell(row, 4),
    hydrologicGroup: cell(row, 5),
    drainageClass: cell(row, 6),
    awhcMmPerM: numberCell(row, 7),
  }));

  return {
    rows: rows.filter((row) => row.mukey),
    metadata: {
      provider: "nrcs-soil-data-access",
      queryFormat: soilDataAccessConfig.format,
    },
  };
}

export class SoilDataAccessProvider implements Pick<LocationProvider, "search" | "getFieldSetupContext"> {
  async search(_query: string): Promise<LocationSearchResult[]> {
    return [];
  }

  async getFieldSetupContext(location: Coordinates): Promise<FieldSetupContext> {
    if (!soilDataAccessApi.enabled) {
      throw new Error("NRCS Soil Data Access is not enabled.");
    }

    const response = await fetchWithTimeout(soilDataAccessApi.url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        accept: "application/json",
      },
      body: new URLSearchParams(Object.entries(buildSoilDetectionPostBody(location))),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NRCS Soil Data Access request failed with ${response.status}: ${errorBody.slice(0, 240)}`);
    }

    const detected = parseSoilDetectionResponse(await response.json());
    const dominant = detected.rows[0];

    if (!dominant) {
      throw new Error("NRCS Soil Data Access did not return a map unit for this coordinate.");
    }

    return {
      ...location,
      label: dominant.mapUnitName,
      soilTexture: dominant.surfaceTexture ?? dominant.componentName,
      awhcMmPerM: dominant.awhcMmPerM ?? 150,
      soilMapUnitKey: dominant.mukey,
      soilMapUnitName: dominant.mapUnitName,
      soilComponentName: dominant.componentName,
      soilComponentPercent: dominant.componentPercent ?? undefined,
      hydrologicGroup: dominant.hydrologicGroup ?? undefined,
      drainageClass: dominant.drainageClass ?? undefined,
      weatherCellId: "Pending weather grid lookup",
      elevationFt: 0,
      metadata: {
        provider: "nrcs-soil-data-access",
      },
    };
  }
}

export const soilDataAccessProvider = new SoilDataAccessProvider();
