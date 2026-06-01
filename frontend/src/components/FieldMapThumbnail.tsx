import { MapPin } from "lucide-react";
import { useState } from "react";
import { mapboxConfig } from "../config/mapbox";

interface FieldMapThumbnailProps {
  lat: number;
  lon: number;
  label: string;
}

export function FieldMapThumbnail({ lat, lon, label }: FieldMapThumbnailProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const hasStaticMapConfig = Boolean(mapboxConfig.token);
  const stylePath = "mapbox/satellite-streets-v12";
  const staticMapUrl = hasStaticMapConfig
    ? `https://api.mapbox.com/styles/v1/${stylePath}/static/pin-s+934936(${lon},${lat})/${lon},${lat},13,0/180x112@2x?access_token=${mapboxConfig.token}`
    : "";

  return (
    <div className="field-map-thumb" aria-label={`${label} map preview`}>
      {staticMapUrl && status !== "error" ? (
        <img src={staticMapUrl} alt="" loading="lazy" onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} />
      ) : null}
      {status !== "loaded" ? (
        <div className="field-map-thumb-fallback">
          <MapPin size={24} />
          <span>{status === "error" ? "Map unavailable" : "Loading map"}</span>
        </div>
      ) : null}
    </div>
  );
}
