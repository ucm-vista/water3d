export const openMeteoConfig = {
  enabled: import.meta.env.VITE_OPEN_METEO_ENABLED !== "false",
  archiveBaseUrl: import.meta.env.VITE_OPEN_METEO_ARCHIVE_BASE_URL ?? "https://archive-api.open-meteo.com",
  archiveRequestBaseUrl: import.meta.env.VITE_OPEN_METEO_ARCHIVE_PROXY_BASE_URL || import.meta.env.VITE_OPEN_METEO_ARCHIVE_BASE_URL || "/api/open-meteo",
  archiveEndpoint: "/v1/archive",
  // Forecast API (api.open-meteo.com, a different host than the archive): its
  // recent past days are observation-assimilated model analysis with no lag,
  // used to backfill the seam between gridMET history and the CFS forecast.
  forecastBaseUrl: import.meta.env.VITE_OPEN_METEO_FORECAST_BASE_URL ?? "https://api.open-meteo.com",
  forecastRequestBaseUrl:
    import.meta.env.VITE_OPEN_METEO_FORECAST_PROXY_BASE_URL || import.meta.env.VITE_OPEN_METEO_FORECAST_BASE_URL || "/api/open-meteo-forecast",
  forecastEndpoint: "/v1/forecast",
};

export function getOpenMeteoArchiveUrl() {
  // Concatenate, never `new URL(endpoint, base)`: the endpoint's leading slash
  // would discard the base's path if the proxy base ever carries one.
  return `${openMeteoConfig.archiveRequestBaseUrl.replace(/\/$/, "")}${openMeteoConfig.archiveEndpoint}`;
}

export function getOpenMeteoForecastUrl() {
  return `${openMeteoConfig.forecastRequestBaseUrl.replace(/\/$/, "")}${openMeteoConfig.forecastEndpoint}`;
}
