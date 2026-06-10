import type { FieldConfig, StageThreshold } from "../types/domain";
import { getCurrentYearStartDate } from "../utils/dateRange";
import { backendConfig } from "../config/backend";
import { getPocketBaseClient, isPocketBaseEnabled } from "./pocketbaseClient";

export interface FieldRepository {
  listFields(): Promise<FieldConfig[]>;
  saveField(field: FieldConfig): Promise<FieldConfig>;
  deleteField?(fieldId: string): Promise<void>;
}

export class PocketBaseFieldRepository implements FieldRepository {
  async listFields(): Promise<FieldConfig[]> {
    if (!isPocketBaseEnabled()) {
      return [];
    }

    const pb = getPocketBaseClient();
    if (!pb.authStore.isValid) {
      return [];
    }

    const records = await pb.collection(backendConfig.pocketBaseFieldsCollection).getFullList<Record<string, unknown>>({
      sort: "name",
    });

    return records.map((record) => fromPocketBaseRecord(record));
  }

  async saveField(field: FieldConfig): Promise<FieldConfig> {
    if (!isPocketBaseEnabled()) {
      throw new Error("PocketBase field storage is scaffolded but disabled.");
    }

    const pb = getPocketBaseClient();
    if (!pb.authStore.isValid) {
      throw new Error("PocketBase auth is required before saving fields.");
    }

    const payload = toPocketBasePayload(field);

    try {
      await pb.collection(backendConfig.pocketBaseFieldsCollection).getOne(field.id);
      const updated = await pb.collection(backendConfig.pocketBaseFieldsCollection).update<Record<string, unknown>>(field.id, payload);
      return fromPocketBaseRecord(updated);
    } catch (error) {
      const created = await pb.collection(backendConfig.pocketBaseFieldsCollection).create<Record<string, unknown>>({
        ...payload,
        id: field.id,
      });
      return fromPocketBaseRecord(created);
    }
  }
}

export const pocketBaseFieldRepository = new PocketBaseFieldRepository();

export function toPocketBasePayload(field: FieldConfig): Record<string, unknown> {
  const pb = getPocketBaseClient();

  return {
    owner: pb.authStore.model?.id,
    name: field.name,
    cropId: field.cropId,
    cropLabel: field.cropLabel,
    lat: field.lat,
    lon: field.lon,
    soilTexture: field.soilTexture,
    awhcMmPerM: field.awhcMmPerM,
    soilMapUnitKey: field.soilMapUnitKey,
    soilMapUnitName: field.soilMapUnitName,
    soilComponentName: field.soilComponentName,
    soilComponentPercent: field.soilComponentPercent,
    hydrologicGroup: field.hydrologicGroup,
    drainageClass: field.drainageClass,
    rootDepthM: field.rootDepthM,
    madFraction: field.madFraction,
    stageStartDate: field.stageStartDate,
    metadata: {
      gddBaseTempC: field.gddBaseTempC,
      gddUpperTempC: field.gddUpperTempC,
      stageThresholds: field.stageThresholds,
    },
    irrigationEfficiency: field.irrigationEfficiency,
    weatherCell: field.weatherCell,
    elevationFt: field.elevationFt,
  };
}

export function fromPocketBaseRecord(record: Record<string, unknown>): FieldConfig {
  return {
    id: String(record.id),
    name: String(record.name ?? "Untitled Field"),
    cropId: String(record.cropId ?? "almond") as FieldConfig["cropId"],
    cropLabel: String(record.cropLabel ?? "Almond"),
    lat: Number(record.lat ?? 0),
    lon: Number(record.lon ?? 0),
    soilTexture: String(record.soilTexture ?? "Unknown"),
    awhcMmPerM: Number(record.awhcMmPerM ?? 150),
    soilMapUnitKey: optionalString(record.soilMapUnitKey),
    soilMapUnitName: optionalString(record.soilMapUnitName),
    soilComponentName: optionalString(record.soilComponentName),
    soilComponentPercent: optionalNumber(record.soilComponentPercent),
    hydrologicGroup: optionalString(record.hydrologicGroup),
    drainageClass: optionalString(record.drainageClass),
    rootDepthM: Number(record.rootDepthM ?? 1),
    madFraction: Number(record.madFraction ?? 0.5),
    stageStartDate: String(record.stageStartDate ?? getCurrentYearStartDate()),
    gddBaseTempC: parseMetadataNumber(record.metadata, "gddBaseTempC"),
    gddUpperTempC: parseMetadataNumber(record.metadata, "gddUpperTempC"),
    stageThresholds: parseStageThresholds(record.metadata),
    irrigationEfficiency: Number(record.irrigationEfficiency ?? 0.85),
    weatherCell: String(record.weatherCell ?? "Pending weather grid lookup"),
    elevationFt: Number(record.elevationFt ?? 0),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStageThresholds(metadata: unknown): StageThreshold[] | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const thresholds = (metadata as Record<string, unknown>).stageThresholds;
  if (!Array.isArray(thresholds)) {
    return undefined;
  }

  const parsed = thresholds
    .map((threshold): StageThreshold | null => {
      if (!threshold || typeof threshold !== "object") {
        return null;
      }

      const record = threshold as Record<string, unknown>;
      const rawGdd = record.gdd;
      const gdd = rawGdd === null ? null : Number(rawGdd);
      if (rawGdd !== null && !Number.isFinite(gdd)) {
        return null;
      }

      return {
        label: String(record.label ?? "Stage"),
        gdd,
        note: optionalString(record.note),
        confidence: optionalString(record.confidence) as StageThreshold["confidence"],
      };
    })
    .filter((threshold): threshold is StageThreshold => threshold !== null);

  return parsed.length ? parsed : undefined;
}

function parseMetadataNumber(metadata: unknown, key: string): number | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  return optionalNumber((metadata as Record<string, unknown>)[key]);
}
