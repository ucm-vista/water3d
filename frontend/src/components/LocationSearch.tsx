import { Search } from "lucide-react";
import { useState } from "react";
import { mapConfig } from "../config/map";

interface LocationSearchProps {
  onSelect: (location: { lat: number; lon: number }) => void;
  placeholder?: string;
}

// Keyless geocoding via OSM Nominatim. Searches on Enter only — Nominatim's
// usage policy disallows per-keystroke autocomplete. Also accepts a raw
// "lat, lon" paste directly.
export function LocationSearch({ onSelect, placeholder }: LocationSearchProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "no-results" | "error">("idle");

  async function search() {
    const query = value.trim();
    if (!query) return;

    const coords = query.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (coords) {
      const lat = Number(coords[1]);
      const lon = Number(coords[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        setStatus("idle");
        onSelect({ lat, lon });
        return;
      }
    }

    setStatus("searching");
    try {
      const url = `${mapConfig.nominatimBaseUrl}/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1&countrycodes=us`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Nominatim ${response.status}`);
      const results = (await response.json()) as Array<{ lat: string; lon: string }>;
      if (!results[0]) {
        setStatus("no-results");
        return;
      }
      setStatus("idle");
      onSelect({ lat: Number(results[0].lat), lon: Number(results[0].lon) });
    } catch {
      setStatus("error");
    }
  }

  return (
    <label className="search-box">
      <Search size={18} />
      <input
        value={value}
        placeholder={placeholder ?? "Search address or place, then press Enter"}
        onChange={(event) => {
          setValue(event.target.value);
          if (status !== "idle") setStatus("idle");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void search();
        }}
      />
      {status !== "idle" ? (
        <span className="search-status">{status === "searching" ? "Searching…" : status === "no-results" ? "No results" : "Search failed"}</span>
      ) : null}
    </label>
  );
}
