import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const openEtTarget = env.VITE_OPENET_BASE_URL || "https://openet-api.org";
  const soilTarget = env.VITE_SOIL_DATA_ACCESS_BASE_URL || "https://sdmdataaccess.nrcs.usda.gov";
  const climateToolboxTarget = env.VITE_CLIMATE_TOOLBOX_CFS_BASE_URL || "https://climate-dev.nkn.uidaho.edu";
  const openMeteoTarget = env.VITE_OPEN_METEO_ARCHIVE_BASE_URL || "https://archive-api.open-meteo.com";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/openet": {
          target: openEtTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/openet/, ""),
        },
        "/api/soil-data-access": {
          target: soilTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/soil-data-access/, ""),
        },
        "/api/climate-toolbox": {
          target: climateToolboxTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/climate-toolbox/, ""),
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
