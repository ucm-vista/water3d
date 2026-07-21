import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapConfig } from "../config/map";

const satelliteStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [mapConfig.tileUrl],
      // Esri serves 256px tiles; declaring 128 makes MapLibre fetch one zoom
      // level deeper and render at 2x density — sharp on hi-DPI displays at
      // the cost of 4x tile requests. maxzoom drops by one to compensate.
      tileSize: 128,
      maxzoom: mapConfig.maxZoom - 1,
      attribution: mapConfig.tileAttribution,
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

interface FieldSetupMapProps {
  lat: number;
  lon: number;
  onLocationChange: (location: { lat: number; lon: number }) => void;
}

function FieldSetupMap({ lat, lon, onLocationChange }: FieldSetupMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialLocationRef = useRef({ lat, lon });
  const onLocationChangeRef = useRef(onLocationChange);
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    try {
      setError(null);
      setIsLoaded(false);
      const initialLocation = initialLocationRef.current;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: satelliteStyle,
        center: [initialLocation.lon, initialLocation.lat],
        zoom: mapConfig.defaultZoom,
        attributionControl: { compact: true },
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      const marker = new maplibregl.Marker({ color: "#934936" }).setLngLat([initialLocation.lon, initialLocation.lat]).addTo(map);
      markerRef.current = marker;
      mapRef.current = map;

      const markLoaded = () => {
        setIsLoaded(true);
        map.resize();
      };

      map.once("load", markLoaded);
      map.once("style.load", markLoaded);
      map.once("idle", markLoaded);

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
      setError(caught instanceof Error ? caught.message : "Map failed to initialize.");
      return;
    }
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([lon, lat]);
    mapRef.current?.easeTo({ center: [lon, lat], duration: 350 });
  }, [lat, lon]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-canvas" />
      {!isLoaded && !error ? <div className="map-loading">Loading map...</div> : null}
      {error ? <div className="map-loading map-error">{error}</div> : null}
    </div>
  );
}

export default FieldSetupMap;
