import { defaultFields } from "../data/fields";
import type { FieldConfig } from "../types/domain";

const STORAGE_KEY = "water3d.fields.v1";

export function loadFields(): FieldConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultFields;
    const parsed = JSON.parse(stored) as FieldConfig[];
    return parsed.length ? parsed : defaultFields;
  } catch {
    return defaultFields;
  }
}

export function saveFields(fields: FieldConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
  } catch {
    // Persisting fields is best-effort only (private mode, quota).
  }
}
