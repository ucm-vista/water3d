export interface BackendConfig {
  pocketBaseEnabled: boolean;
  pocketBaseUrl: string;
  pocketBaseFieldsCollection: string;
}

export const backendConfig: BackendConfig = {
  pocketBaseEnabled: import.meta.env.VITE_POCKETBASE_ENABLED === "true",
  pocketBaseUrl: import.meta.env.VITE_POCKETBASE_URL ?? "",
  pocketBaseFieldsCollection: import.meta.env.VITE_POCKETBASE_FIELDS_COLLECTION ?? "fields",
};
