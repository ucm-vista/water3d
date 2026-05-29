import type { FieldConfig } from "../types/domain";
import { defaultFields } from "../data/fields";

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
}
