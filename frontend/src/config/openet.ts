export type OpenEtModel = "Ensemble" | "geeSEBAL" | "SSEBop" | "SIMS" | "DisALEXI" | "PTJPL" | "eeMETRIC";

export type OpenEtReferenceEt = "gridMET" | "CIMIS" | "FRET";

export type OpenEtUnits = "mm" | "in";

export type OpenEtInterval = "daily" | "monthly";

export type OpenEtVariable = "ET" | "ET_MAD_MIN" | "ET_MAD_MAX" | "ETo" | "ETr" | "ETof" | "NDVI" | "PR" | "COUNT" | "MODEL_COUNT";

export interface OpenEtVariableConfig {
  variable: OpenEtVariable;
  label: string;
  water3dField: "etActualMm" | "etReferenceMm" | "etoMm" | "precipMm" | "ndvi" | "quality";
  description: string;
  requiredForAnalytics: boolean;
}

export const openEtVariables: OpenEtVariableConfig[] = [
  {
    variable: "ET",
    label: "Actual ET",
    water3dField: "etActualMm",
    description: "Satellite-based actual evapotranspiration for field water use and historical ET accumulation.",
    requiredForAnalytics: true,
  },
  {
    variable: "ETo",
    label: "Reference ETo",
    water3dField: "etoMm",
    description: "Grass reference ET for dashboard comparisons and fallback ETc calculations.",
    requiredForAnalytics: true,
  },
  {
    variable: "PR",
    label: "Precipitation",
    water3dField: "precipMm",
    description: "Precipitation depth when available from OpenET raster products.",
    requiredForAnalytics: true,
  },
  {
    variable: "ETof",
    label: "ET Fraction",
    water3dField: "etReferenceMm",
    description: "ET fraction for diagnosing actual ET relative to reference ET.",
    requiredForAnalytics: false,
  },
  {
    variable: "NDVI",
    label: "NDVI",
    water3dField: "ndvi",
    description: "Vegetation index for crop vigor and canopy context.",
    requiredForAnalytics: false,
  },
  {
    variable: "MODEL_COUNT",
    label: "Model Count",
    water3dField: "quality",
    description: "Number of OpenET models contributing to ensemble values.",
    requiredForAnalytics: false,
  },
];

export const openEtConfig = {
  enabled: import.meta.env.VITE_OPENET_ENABLED === "true",
  baseUrl: import.meta.env.VITE_OPENET_BASE_URL ?? "https://openet-api.org",
  requestBaseUrl: import.meta.env.VITE_OPENET_PROXY_BASE_URL || import.meta.env.VITE_OPENET_BASE_URL || "https://openet-api.org",
  token: import.meta.env.VITE_OPENET_ACCESS_TOKEN ?? "",
  defaultModel: (import.meta.env.VITE_OPENET_DEFAULT_MODEL ?? "Ensemble") as OpenEtModel,
  defaultReferenceEt: (import.meta.env.VITE_OPENET_REFERENCE_ET ?? "gridMET") as OpenEtReferenceEt,
  defaultUnits: (import.meta.env.VITE_OPENET_UNITS ?? "mm") as OpenEtUnits,
  defaultVersion: Number(import.meta.env.VITE_OPENET_VERSION ?? 2.1),
  maxAvailableDate: import.meta.env.VITE_OPENET_MAX_AVAILABLE_DATE || "2025-12-31",
  defaultInterval: "daily" as OpenEtInterval,
  endpoints: {
    accountStatus: "/account/status",
    rasterPointTimeseries: "/raster/timeseries/point",
    rasterPolygonTimeseries: "/raster/timeseries/polygon",
    rasterMetadata: "/raster/metadata",
    geodatabaseFieldIds: "/geodatabase/metadata/ids",
    geodatabaseFieldProperties: "/geodatabase/metadata/properties",
    geodatabaseTimeseries: "/geodatabase/timeseries",
    geodatabaseBoundaries: "/geodatabase/metadata/boundaries",
  },
  variables: {
    requiredForWater3d: ["ET", "ETo", "PR"] satisfies OpenEtVariable[],
    optionalForWater3d: ["ETof", "NDVI", "MODEL_COUNT"] satisfies OpenEtVariable[],
  },
};

export function getOpenEtVariableVersion(variable: OpenEtVariable): number {
  if (variable === "ETo" || variable === "ETr" || variable === "PR") {
    return 1.0;
  }

  return openEtConfig.defaultVersion;
}

export function getOpenEtUrl(endpoint: keyof typeof openEtConfig.endpoints) {
  const baseUrl = openEtConfig.requestBaseUrl;
  const path = openEtConfig.endpoints[endpoint];

  if (baseUrl.startsWith("/")) {
    return `${baseUrl.replace(/\/$/, "")}${path}`;
  }

  return new URL(path, baseUrl).toString();
}
