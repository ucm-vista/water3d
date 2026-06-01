import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const openEtTarget = env.VITE_OPENET_BASE_URL || "https://openet-api.org";
  const soilTarget = env.VITE_SOIL_DATA_ACCESS_BASE_URL || "https://sdmdataaccess.nrcs.usda.gov";

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
      },
    },
  };
});
