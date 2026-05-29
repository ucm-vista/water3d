export const mapboxConfig = {
  token: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "",
  styleUrl: import.meta.env.VITE_MAPBOX_STYLE_URL ?? "",
  defaultCenter: {
    lat: 36.7378,
    lon: -119.7871,
  },
  defaultZoom: 11,
};
