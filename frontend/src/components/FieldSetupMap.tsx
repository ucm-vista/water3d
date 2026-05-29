import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { mapboxConfig } from "../config/mapbox";

interface FieldSetupMapProps {
  lat: number;
  lon: number;
  onLocationChange: (location: { lat: number; lon: number }) => void;
}

function FieldSetupMap({ lat, lon, onLocationChange }: FieldSetupMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const initialLocationRef = useRef({ lat, lon });
  const onLocationChangeRef = useRef(onLocationChange);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxConfig.token || !mapboxConfig.styleUrl) return;

    mapboxgl.accessToken = mapboxConfig.token;
    const initialLocation = initialLocationRef.current;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapboxConfig.styleUrl,
      center: [initialLocation.lon, initialLocation.lat],
      zoom: mapboxConfig.defaultZoom,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    const marker = new mapboxgl.Marker({ color: "#934936" }).setLngLat([initialLocation.lon, initialLocation.lat]).addTo(map);
    markerRef.current = marker;
    mapRef.current = map;

    map.on("click", (event) => {
      const nextLocation = {
        lat: Number(event.lngLat.lat.toFixed(5)),
        lon: Number(event.lngLat.lng.toFixed(5)),
      };
      marker.setLngLat([nextLocation.lon, nextLocation.lat]);
      onLocationChangeRef.current(nextLocation);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([lon, lat]);
    mapRef.current?.easeTo({ center: [lon, lat], duration: 350 });
  }, [lat, lon]);

  if (!mapboxConfig.token || !mapboxConfig.styleUrl) {
    return <div className="map-loading">Mapbox env vars are not configured.</div>;
  }

  return (
    <div className="mapbox-shell">
      <div ref={containerRef} className="mapbox-canvas" />
      <div className="mapbox-pin-label">PIN PLACED</div>
    </div>
  );
}

export default FieldSetupMap;
