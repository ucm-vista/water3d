import { Search } from "lucide-react";
import type React from "react";
import { lazy, Suspense, useState } from "react";
import { cropOptions } from "../data/crops";
import { mapboxConfig } from "../config/mapbox";
import type { CropId, FieldConfig } from "../types/domain";

const FieldSetupMap = lazy(() => import("./FieldSetupMap"));

interface SetupPanelProps {
  onCreateField: (field: FieldConfig) => void;
}

export function SetupPanel({ onCreateField }: SetupPanelProps) {
  const [location, setLocation] = useState(mapboxConfig.defaultCenter);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cropId = String(form.get("cropId")) as CropId;
    const crop = cropOptions.find((option) => option.id === cropId) ?? cropOptions[0];
    const fieldName = String(form.get("fieldName") || "New Field");

    onCreateField({
      id: `${fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name: fieldName,
      cropId: crop.id,
      cropLabel: crop.varietyHint ? `${crop.label} (${crop.varietyHint})` : crop.label,
      lat: location.lat,
      lon: location.lon,
      soilTexture: "Sandy Loam (SSURGO)",
      awhcMmPerM: crop.tawMmPerM,
      rootDepthM: crop.rootDepthM,
      madFraction: crop.madFraction,
      stageStartDate: "2026-02-01",
      irrigationEfficiency: 0.85,
      weatherCell: "Grid ID #4829",
      elevationFt: 342,
    });
    event.currentTarget.reset();
  }

  return (
    <main className="content setup-content">
      <div className="page-heading">
        <div>
          <h1>New Field Configuration</h1>
          <p>Register a field once, then run daily ET, GDD, chill, and stress analytics from maintained data feeds.</p>
        </div>
      </div>

      <form className="setup-grid" onSubmit={handleSubmit}>
        <section className="panel setup-map-card">
          <h2>1. Define Field Location</h2>
          <p>Search for a ranch or drop a pin to bind weather, soil, and OpenET coordinates.</p>
          <label className="search-box">
            <Search size={22} />
            <input placeholder="Search address, ranch name, or lat/long..." />
          </label>
          <div className="map-surface">
            <Suspense fallback={<div className="map-loading">Loading map...</div>}>
              <FieldSetupMap lat={location.lat} lon={location.lon} onLocationChange={setLocation} />
            </Suspense>
          </div>
        </section>

        <aside className="setup-side">
          <section className="panel properties-card">
            <h3>Detected Properties</h3>
            <dl>
              <div>
                <dt>Soil Texture</dt>
                <dd>Sandy Loam (SSURGO)</dd>
              </div>
              <div>
                <dt>Weather Cell</dt>
                <dd>Grid ID #4829</dd>
              </div>
              <div>
                <dt>Elevation</dt>
                <dd>342 ft</dd>
              </div>
            </dl>
          </section>

          <section className="panel crop-card">
            <h2>2. Select Crop</h2>
            {cropOptions.map((crop, index) => (
              <label key={crop.id} className="crop-option">
                <input type="radio" name="cropId" value={crop.id} defaultChecked={index === 0} />
                <span>{crop.varietyHint ? `${crop.label} (${crop.varietyHint})` : crop.label}</span>
              </label>
            ))}
          </section>
        </aside>

        <section className="activate-card">
          <div>
            <h2>3. Name Your Field</h2>
            <input name="fieldName" placeholder="e.g. West Orchard Sector 4" required />
          </div>
          <button type="submit">Activate Field Monitoring</button>
        </section>
      </form>
    </main>
  );
}
