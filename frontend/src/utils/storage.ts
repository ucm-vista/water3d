import type { FieldConfig } from "../types/domain";
import { loadLocalFields, saveLocalFields } from "../backend/fieldStorage";

export function loadFields(): FieldConfig[] {
  return loadLocalFields();
}

export function saveFields(fields: FieldConfig[]): void {
  saveLocalFields(fields);
}
