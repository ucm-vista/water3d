import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { mapConfig } from "../config/map";

interface FieldMapThumbnailProps {
  lat: number;
  lon: number;
  label: string;
}

// 180x112@2x thumbnail via Esri's keyless MapServer export endpoint. The bbox
// spans ~2.6 km wide at Central Valley latitudes with the 360:224 aspect baked
// in; the pin is a CSS overlay at the center rather than part of the image.
const BBOX_DLON = 0.012;
const BBOX_DLAT = 0.006;

export function FieldMapThumbnail({ lat, lon, label }: FieldMapThumbnailProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const bbox = `${lon - BBOX_DLON},${lat - BBOX_DLAT},${lon + BBOX_DLON},${lat + BBOX_DLAT}`;
  const staticMapUrl = `${mapConfig.exportUrl}?bbox=${bbox}&bboxSR=4326&size=360,224&format=jpg&f=image`;

  // The component is keyed by field.id, so editing coordinates in place changes
  // the image URL without remounting; reset status so the new image can load
  // (and recover from a prior error state, where the <img> is otherwise unmounted).
  useEffect(() => {
    setStatus("loading");
  }, [staticMapUrl]);

  return (
    <div className="field-map-thumb" aria-label={`${label} map preview`}>
      {status !== "error" ? (
        <img src={staticMapUrl} alt="" loading="lazy" onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} />
      ) : null}
      {status === "loaded" ? (
        <>
          <span className="field-map-thumb-pin" aria-hidden>
            <MapPin size={20} />
          </span>
          <span className="field-map-thumb-attrib">© Esri</span>
        </>
      ) : (
        <div className="field-map-thumb-fallback">
          <MapPin size={24} />
          <span>{status === "error" ? "Map unavailable" : "Loading map"}</span>
        </div>
      )}
    </div>
  );
}
