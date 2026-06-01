const DEBUG_STORAGE_KEY = "water3d.debug";

export type DataSourceStatus = Record<string, unknown>;

declare global {
  interface Window {
    __WATER3D_STATUS__?: Record<string, DataSourceStatus>;
  }
}

export function isDebugEnabled() {
  return import.meta.env.VITE_DEBUG_DATA_SOURCES === "true" || localStorage.getItem(DEBUG_STORAGE_KEY) === "true";
}

export function setDebugStatus(source: string, status: DataSourceStatus) {
  if (typeof window === "undefined") {
    return;
  }

  window.__WATER3D_STATUS__ = {
    ...(window.__WATER3D_STATUS__ ?? {}),
    [source]: {
      ...status,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function debugDataSource(source: string, message: string, details?: DataSourceStatus) {
  setDebugStatus(source, {
    message,
    ...(details ?? {}),
  });

  if (!isDebugEnabled()) {
    return;
  }

  console.info(`[Water3D:${source}] ${message}`, details ?? "");
}

export function enableWater3dDebug() {
  localStorage.setItem(DEBUG_STORAGE_KEY, "true");
  console.info("[Water3D] Data-source debug logging enabled. Reload the page to capture startup events.");
}

export function disableWater3dDebug() {
  localStorage.removeItem(DEBUG_STORAGE_KEY);
  console.info("[Water3D] Data-source debug logging disabled.");
}

if (typeof window !== "undefined") {
  Object.assign(window, {
    enableWater3dDebug,
    disableWater3dDebug,
  });
}
