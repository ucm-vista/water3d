import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const climateToolboxTarget = env.VITE_CLIMATE_TOOLBOX_CFS_BASE_URL || "https://climate-dev.nkn.uidaho.edu";
  const gridMetTarget = env.VITE_GRIDMET_BASE_URL || "https://toolbox-webservices.nkn.uidaho.edu";
  const openMeteoTarget = env.VITE_OPEN_METEO_ARCHIVE_BASE_URL || "https://archive-api.open-meteo.com";

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
