import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const climateToolboxTarget = env.VITE_CLIMATE_TOOLBOX_CFS_BASE_URL || "https://climate-dev.nkn.uidaho.edu";
  const gridMetTarget = env.VITE_GRIDMET_BASE_URL || "https://toolbox-webservices.nkn.uidaho.edu";
  const openMeteoTarget = env.VITE_OPEN_METEO_ARCHIVE_BASE_URL || "https://archive-api.open-meteo.com";
  const openMeteoForecastTarget = env.VITE_OPEN_METEO_FORECAST_BASE_URL || "https://api.open-meteo.com";

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5180,
      strictPort: true,
      proxy: {
        "/api/climate-toolbox": {
          target: climateToolboxTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/climate-toolbox/, ""),
        },
        "/api/gridmet": {
          target: gridMetTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/gridmet/, ""),
        },
        // Must precede "/api/open-meteo": proxy contexts match by prefix in
        // registration order, and the archive rule is a prefix of this one.
        "/api/open-meteo-forecast": {
          target: openMeteoForecastTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/open-meteo-forecast/, ""),
        },
        "/api/open-meteo": {
          target: openMeteoTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/open-meteo/, ""),
        },
      },
    },
  };
});
