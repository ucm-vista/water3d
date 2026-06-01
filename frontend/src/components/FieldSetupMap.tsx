import { useEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxConfig.token || !mapboxConfig.styleUrl) {
      setError("Mapbox env vars are not configured.");
      return;
    }

    if (!mapboxgl.supported()) {
      setError("Mapbox is not supported in this browser.");
      return;
    }

    try {
      setError(null);
      setIsLoaded(false);
      mapboxgl.accessToken = mapboxConfig.token;
      const initialLocation = initialLocationRef.current;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: mapboxConfig.styleUrl,
        center: [initialLocation.lon, initialLocation.lat],
        zoom: mapboxConfig.defaultZoom,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

      const marker = new mapboxgl.Marker({ color: "#934936" }).setLngLat([initialLocation.lon, initialLocation.lat]).addTo(map);
      markerRef.current = marker;
      mapRef.current = map;

      const markLoaded = () => {
        setIsLoaded(true);
        map.resize();
      };

      map.once("load", markLoaded);
      map.once("style.load", markLoaded);
      map.once("idle", markLoaded);

      map.on("error", (event) => {
        const message = event.error?.message ?? "";
        if (message.toLowerCase().includes("token") || message.toLowerCase().includes("style")) {
          setError(message || "Mapbox failed to load.");
        }
      });

      map.on("click", (event) => {
        const nextLocation = {
          lat: Number(event.lngLat.lat.toFixed(5)),
          lon: Number(event.lngLat.lng.toFixed(5)),
        };
        marker.setLngLat([nextLocation.lon, nextLocation.lat]);
        onLocationChangeRef.current(nextLocation);
      });

      const resizeTimer = window.setTimeout(() => {
        map.resize();
        if (map.loaded() || map.isStyleLoaded()) {
          markLoaded();
        }
      }, 250);
      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);

      return () => {
        window.clearTimeout(resizeTimer);
        resizeObserver.disconnect();
        map.remove();
        mapRef.current = null;
        markerRef.current = null;
        setIsLoaded(false);
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mapbox failed to initialize.");
      return;
    }
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([lon, lat]);
    mapRef.current?.easeTo({ center: [lon, lat], duration: 350 });
  }, [lat, lon]);

  return (
    <div className="mapbox-shell">
      <div ref={containerRef} className="mapbox-canvas" />
      {!isLoaded && !error ? <div className="map-loading">Loading map...</div> : null}
      {error ? <div className="map-loading map-error">{error}</div> : null}
      {isLoaded && !error ? <div className="mapbox-pin-label">PIN PLACED</div> : null}
    </div>
  );
}

export default FieldSetupMap;
