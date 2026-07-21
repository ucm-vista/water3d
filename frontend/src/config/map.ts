// Keyless map stack — no tokens, no billing account to expire:
//   tiles:     Esri World Imagery (attribution required, shown on the map)
//   geocoding: OSM Nominatim (usage policy: ≤1 req/s, no autocomplete)
export const mapConfig = {
  tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  tileAttribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  // Static thumbnails come from the same MapServer's export endpoint.
  exportUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export",
  nominatimBaseUrl: "https://nominatim.openstreetmap.org",
  defaultCenter: {
    lat: 36.7378,
    lon: -119.7871,
  },
  defaultZoom: 11,
  maxZoom: 19,
};
