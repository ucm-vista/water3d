import { defaultFields } from "../data/fields";
import type { FieldConfig } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { getAuthSession } from "./authRepository";
import { pocketBaseFieldRepository } from "./fieldRepository";
import { isPocketBaseEnabled } from "./pocketbaseClient";

const STORAGE_KEY = "water3d.fields.v1";

// v1 decision (see PLAN.md W5): keep field storage in the browser only. The auth
// code (login/signup) stays wired up and intact, but fields are never read from or
// written to PocketBase yet. Flip this to `false` to re-enable account-backed sync
// once the account/migration flow is finalized.
const BROWSER_STORAGE_ONLY = true;

export interface FieldStorageState {
  fields: FieldConfig[];
  source: "pocketbase" | "local";
  warning?: string;
}

export function loadLocalFields(): FieldConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultFields;
    const parsed = JSON.parse(stored) as FieldConfig[];
    return parsed.length ? parsed : defaultFields;
  } catch {
    return defaultFields;
  }
}

export function saveLocalFields(fields: FieldConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  } catch (error) {
    debugDataSource("pocketbase", "local field save failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function loadFieldStorage(): Promise<FieldStorageState> {
  if (BROWSER_STORAGE_ONLY || !isPocketBaseEnabled() || !getAuthSession().isAuthenticated) {
    const fields = loadLocalFields();
    debugDataSource("pocketbase", "field load using local storage", {
      enabled: isPocketBaseEnabled(),
      authenticated: getAuthSession().isAuthenticated,
      count: fields.length,
    });
    return { fields, source: "local" };
  }

  try {
    const fields = await pocketBaseFieldRepository.listFields();
    debugDataSource("pocketbase", "fields loaded from PocketBase", {
      count: fields.length,
    });
    if (fields.length) {
      return { fields, source: "pocketbase" };
    }

    return {
      fields: loadLocalFields(),
      source: "local",
      warning: "PocketBase has no saved fields yet; showing local fields.",
    };
  } catch (error) {
    const fields = loadLocalFields();
    const warning = error instanceof Error ? error.message : "PocketBase fields could not be loaded.";
    debugDataSource("pocketbase", "field load failed; using local storage", {
      error: warning,
      count: fields.length,
    });
    return { fields, source: "local", warning };
  }
}

export async function saveFieldStorage(fields: FieldConfig[], changedField?: FieldConfig): Promise<FieldStorageState> {
  saveLocalFields(fields);

  if (BROWSER_STORAGE_ONLY || !isPocketBaseEnabled() || !getAuthSession().isAuthenticated || !changedField) {
    debugDataSource("pocketbase", "field save using local storage", {
      enabled: isPocketBaseEnabled(),
      authenticated: getAuthSession().isAuthenticated,
      count: fields.length,
    });
    return { fields, source: "local" };
  }

  try {
    const savedField = await pocketBaseFieldRepository.saveField(changedField);
    const nextFields = fields.map((field) => (field.id === savedField.id ? savedField : field));
    saveLocalFields(nextFields);
    debugDataSource("pocketbase", "field saved to PocketBase", {
      fieldId: savedField.id,
      count: nextFields.length,
    });
    return { fields: nextFields, source: "pocketbase" };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "PocketBase field save failed.";
    debugDataSource("pocketbase", "field save failed; local copy retained", {
      fieldId: changedField.id,
      error: warning,
    });
    return { fields, source: "local", warning };
  }
}
