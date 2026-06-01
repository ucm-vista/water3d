import type { FieldConfig } from "../types/domain";
import { cropProfiles } from "./crops";
import { toIsoDate } from "../utils/dateRange";

const almond = cropProfiles.almond;

export const defaultFields: FieldConfig[] = [
  {
    id: "green-valley-a12",
    name: "Green Valley Ranch",
    cropId: almond.id,
    cropLabel: `${almond.label} (${almond.varietyHint})`,
    lat: 36.7378,
    lon: -119.7871,
    soilTexture: "Sandy Loam (SSURGO)",
    awhcMmPerM: almond.tawMmPerM,
    rootDepthM: almond.rootDepthM,
    madFraction: almond.madFraction,
    stageStartDate: toIsoDate(new Date()),
    irrigationEfficiency: 0.85,
    weatherCell: "Grid ID #4829",
    elevationFt: 342,
  },
];
