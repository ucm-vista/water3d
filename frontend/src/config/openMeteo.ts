export const openMeteoConfig = {
  enabled: import.meta.env.VITE_OPEN_METEO_ENABLED !== "false",
  archiveBaseUrl: import.meta.env.VITE_OPEN_METEO_ARCHIVE_BASE_URL ?? "https://archive-api.open-meteo.com",
  archiveRequestBaseUrl: import.meta.env.VITE_OPEN_METEO_ARCHIVE_PROXY_BASE_URL || import.meta.env.VITE_OPEN_METEO_ARCHIVE_BASE_URL || "/api/open-meteo",
  archiveEndpoint: "/v1/archive",
};

export function getOpenMeteoArchiveUrl() {
  if (openMeteoConfig.archiveRequestBaseUrl.startsWith("/")) {
    return `${openMeteoConfig.archiveRequestBaseUrl.replace(/\/$/, "")}${openMeteoConfig.archiveEndpoint}`;
  }

  return new URL(openMeteoConfig.archiveEndpoint, openMeteoConfig.archiveRequestBaseUrl).toString();
}
