export const climateToolboxConfig = {
  enabled: import.meta.env.VITE_CLIMATE_TOOLBOX_ENABLED === "true",
  cfsBaseUrl: import.meta.env.VITE_CLIMATE_TOOLBOX_CFS_BASE_URL ?? "https://climate-dev.nkn.uidaho.edu",
  cfsRequestBaseUrl:
    import.meta.env.VITE_CLIMATE_TOOLBOX_CFS_PROXY_BASE_URL ||
    import.meta.env.VITE_CLIMATE_TOOLBOX_CFS_BASE_URL ||
    "https://climate-dev.nkn.uidaho.edu",
  cfsEndpoint: "/Services/get-cfs-data/",
  defaultDecimalPrecision: "4",
  forecastVariable: "pet",
  forecastHorizonDays: 28,
};

export function getClimateToolboxCfsUrl() {
  if (climateToolboxConfig.cfsRequestBaseUrl.startsWith("/")) {
    return `${climateToolboxConfig.cfsRequestBaseUrl.replace(/\/$/, "")}${climateToolboxConfig.cfsEndpoint}`;
  }

  return new URL(climateToolboxConfig.cfsEndpoint, climateToolboxConfig.cfsRequestBaseUrl).toString();
}
