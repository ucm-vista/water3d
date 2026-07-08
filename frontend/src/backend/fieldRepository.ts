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
    const collection = pb.collection(backendConfig.pocketBaseFieldsCollection);

    // Only a genuine 404 from the existence check should fall back to create();
    // an update failure (network, validation, permission) must surface instead
    // of triggering a create() that then fails with a duplicate-id error.
    let exists = false;
    try {
      await collection.getOne(field.id);
      exists = true;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
    }

    const saved = exists
      ? await collection.update<Record<string, unknown>>(field.id, payload)
      : await collection.create<Record<string, unknown>>({ ...payload, id: field.id });

    return fromPocketBaseRecord(saved);
  }
}

export const pocketBaseFieldRepository = new PocketBaseFieldRepository();

export function toPocketBasePayload(field: FieldConfig): Record<string, unknown> {
  const pb = getPocketBaseClient();

  // The `fields` collection marks soilTexture, awhcMmPerM, rootDepthM,
  // madFraction, irrigationEfficiency, and weatherCell as required, but a
  // freshly created field leaves them undefined. Coalesce to the same defaults
  // fromPocketBaseRecord() applies on read so create()/update() never fails a
  // required-value check and silently drops the field to local-only storage.
  return {
    owner: pb.authStore.model?.id,
    name: field.name,
    cropId: field.cropId,
    cropLabel: field.cropLabel,
    lat: field.lat,
    lon: field.lon,
    soilTexture: field.soilTexture ?? "Unknown",
    awhcMmPerM: field.awhcMmPerM ?? 150,
    soilMapUnitKey: field.soilMapUnitKey,
    soilMapUnitName: field.soilMapUnitName,
    soilComponentName: field.soilComponentName,
    soilComponentPercent: field.soilComponentPercent,
    hydrologicGroup: field.hydrologicGroup,
    drainageClass: field.drainageClass,
    rootDepthM: field.rootDepthM ?? 1,
    madFraction: field.madFraction ?? 0.5,
    stageStartDate: field.stageStartDate,
    metadata: {
      gddBaseTempC: field.gddBaseTempC,
      gddUpperTempC: field.gddUpperTempC,
      stageThresholds: field.stageThresholds,
      areaAcres: field.areaAcres,
    },
    irrigationEfficiency: field.irrigationEfficiency ?? 0.85,
    weatherCell: field.weatherCell ?? "Pending weather grid lookup",
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
    areaAcres: parseMetadataNumber(record.metadata, "areaAcres"),
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
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
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
