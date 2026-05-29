export interface BackendConfig {
  pocketBaseEnabled: boolean;
  pocketBaseUrl: string;
}

export const backendConfig: BackendConfig = {
  pocketBaseEnabled: import.meta.env.VITE_POCKETBASE_ENABLED === "true",
  pocketBaseUrl: import.meta.env.VITE_POCKETBASE_URL ?? "",
};
