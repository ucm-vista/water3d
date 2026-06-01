export const soilDataAccessConfig = {
  enabled: import.meta.env.VITE_SOIL_DATA_ACCESS_ENABLED === "true",
  baseUrl: import.meta.env.VITE_SOIL_DATA_ACCESS_BASE_URL ?? "https://sdmdataaccess.nrcs.usda.gov",
  requestBaseUrl: import.meta.env.VITE_SOIL_DATA_ACCESS_PROXY_BASE_URL || import.meta.env.VITE_SOIL_DATA_ACCESS_BASE_URL || "https://sdmdataaccess.nrcs.usda.gov",
  endpoint: "/Tabular/post.rest",
  format: "JSON+COLUMNNAME" as const,
};

export function getSoilDataAccessUrl() {
  if (soilDataAccessConfig.requestBaseUrl.startsWith("/")) {
    return `${soilDataAccessConfig.requestBaseUrl.replace(/\/$/, "")}${soilDataAccessConfig.endpoint}`;
  }

  return new URL(soilDataAccessConfig.endpoint, soilDataAccessConfig.requestBaseUrl).toString();
}
