import type { FieldConfig } from "../types/domain";
import { getPocketBaseClient, isPocketBaseEnabled } from "./pocketbaseClient";

export interface FieldRepository {
  listFields(): Promise<FieldConfig[]>;
  createField(field: FieldConfig): Promise<FieldConfig>;
}

export class PocketBaseFieldRepository implements FieldRepository {
  async listFields(): Promise<FieldConfig[]> {
    if (!isPocketBaseEnabled()) {
      return [];
    }

    // Collection name is intentionally isolated here and not used by the app yet.
    return getPocketBaseClient().collection("fields").getFullList<FieldConfig>();
  }

  async createField(field: FieldConfig): Promise<FieldConfig> {
    if (!isPocketBaseEnabled()) {
      throw new Error("PocketBase field storage is scaffolded but disabled.");
    }

    return getPocketBaseClient().collection("fields").create<FieldConfig>(field);
  }
}
