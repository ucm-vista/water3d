import { Search, X } from "lucide-react";
import { SearchBox } from "@mapbox/search-js-react";
import type React from "react";
import { lazy, Suspense, useEffect, useState } from "react";
import { soilDataAccessApi, soilDataAccessProvider } from "../api";
import { cropOptions } from "../data/crops";
import { mapboxConfig } from "../config/mapbox";
import type { CropId, FieldConfig, StageThreshold } from "../types/domain";
import { debugDataSource } from "../utils/debug";
import { toIsoDate } from "../utils/dateRange";

const FieldSetupMap = lazy(() => import("./FieldSetupMap"));

function currentYearStartDate(): string {
  const now = new Date();
  return toIsoDate(new Date(Date.UTC(now.getFullYear(), 0, 1)));
}

type SearchRetrieveResult = {
  features: Array<{
    geometry: {
      coordinates: number[];
    };
  }>;
};

interface SetupPanelProps {
  onCreateField: (field: FieldConfig) => void;
  onUpdateField?: (field: FieldConfig) => void;
  onCancel?: () => void;
  field?: FieldConfig;
}

export function SetupPanel({ onCreateField, onUpdateField, onCancel, field }: SetupPanelProps) {
  const [location, setLocation] = useState(field ? { lat: field.lat, lon: field.lon } : mapboxConfig.defaultCenter);
  const [searchValue, setSearchValue] = useState("");
  const [selectedCropId, setSelectedCropId] = useState<CropId>(field?.cropId ?? cropOptions[0].id);
  const [detectedProperties, setDetectedProperties] = useState({
    soilTexture: field?.soilTexture ?? "Sandy Loam (SSURGO)",
    awhcMmPerM: field?.awhcMmPerM,
    soilMapUnitKey: field?.soilMapUnitKey,
    soilMapUnitName: field?.soilMapUnitName,
    soilComponentName: field?.soilComponentName,
    soilComponentPercent: field?.soilComponentPercent,
    hydrologicGroup: field?.hydrologicGroup,
    drainageClass: field?.drainageClass,
    weatherCell: field?.weatherCell ?? "Grid ID #4829",
    elevationFt: field?.elevationFt ?? 342,
  });
  const [soilStatus, setSoilStatus] = useState(soilDataAccessApi.enabled ? "Detecting soil..." : "Using local defaults");
  const isEditing = Boolean(field);
  const selectedCrop = cropOptions.find((option) => option.id === selectedCropId) ?? cropOptions[0];

  useEffect(() => {
    let ignore = false;
    const timeout = window.setTimeout(() => {
      async function detectSoil() {
        if (!soilDataAccessApi.enabled) {
          setSoilStatus("Using local defaults");
          debugDataSource("soil", "disabled; using local defaults", {
            enabled: false,
            lat: location.lat,
            lon: location.lon,
          });
          return;
        }

        try {
          setSoilStatus("Detecting soil...");
          debugDataSource("soil", "request started", {
            enabled: true,
            lat: location.lat,
            lon: location.lon,
            requestUrl: soilDataAccessApi.url,
          });
          const context = await soilDataAccessProvider.getFieldSetupContext(location);

          if (ignore) {
            return;
          }

          setDetectedProperties((current) => ({
            ...current,
            soilTexture: context.soilTexture,
            awhcMmPerM: context.awhcMmPerM,
            soilMapUnitKey: context.soilMapUnitKey,
            soilMapUnitName: context.soilMapUnitName,
            soilComponentName: context.soilComponentName,
            soilComponentPercent: context.soilComponentPercent,
            hydrologicGroup: context.hydrologicGroup,
            drainageClass: context.drainageClass,
            weatherCell: context.weatherCellId,
            elevationFt: context.elevationFt,
          }));
          setSoilStatus("NRCS SSURGO detected");
          debugDataSource("soil", "properties detected", {
            lat: location.lat,
            lon: location.lon,
            soilTexture: context.soilTexture,
            awhcMmPerM: context.awhcMmPerM,
            soilMapUnitKey: context.soilMapUnitKey,
            soilComponentName: context.soilComponentName,
            hydrologicGroup: context.hydrologicGroup,
          });
        } catch (error) {
          if (ignore) {
            return;
          }

          setSoilStatus(error instanceof Error ? "Soil lookup unavailable" : "Soil lookup failed");
          debugDataSource("soil", "request failed; using current detected defaults", {
            lat: location.lat,
            lon: location.lon,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      void detectSoil();
    }, 600);

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [location]);

  function handleSearchRetrieve(result: SearchRetrieveResult) {
    const coordinates = result.features[0]?.geometry.coordinates;
    if (!coordinates) {
      return;
    }

    const [lon, lat] = coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      setLocation({ lat, lon });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cropId = selectedCropId;
    const crop = cropOptions.find((option) => option.id === cropId) ?? cropOptions[0];
    const fieldName = String(form.get("fieldName") || "New Field");
    const plantingDate = String(form.get("plantingDate") || field?.stageStartDate || currentYearStartDate());
    const stageThresholds = crop.stages.map((stage, index): StageThreshold => {
      const gdd = Number(form.get(`stageGdd-${index}`));
      return {
        label: stage.label,
        gdd: Number.isFinite(gdd) ? gdd : stage.gdd,
      };
    });

    const nextField: FieldConfig = {
      id: field?.id ?? `${fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name: fieldName,
      cropId: crop.id,
      cropLabel: crop.varietyHint ? `${crop.label} (${crop.varietyHint})` : crop.label,
      lat: location.lat,
      lon: location.lon,
      soilTexture: detectedProperties.soilTexture,
      awhcMmPerM: detectedProperties.awhcMmPerM ?? crop.tawMmPerM,
      soilMapUnitKey: detectedProperties.soilMapUnitKey,
      soilMapUnitName: detectedProperties.soilMapUnitName,
      soilComponentName: detectedProperties.soilComponentName,
      soilComponentPercent: detectedProperties.soilComponentPercent,
      hydrologicGroup: detectedProperties.hydrologicGroup,
      drainageClass: detectedProperties.drainageClass,
      rootDepthM: crop.rootDepthM,
      madFraction: crop.madFraction,
      stageStartDate: plantingDate,
      stageThresholds,
      irrigationEfficiency: field?.irrigationEfficiency ?? 0.85,
      weatherCell: detectedProperties.weatherCell,
      elevationFt: detectedProperties.elevationFt,
    };

    if (isEditing && onUpdateField) {
      onUpdateField(nextField);
    } else {
      onCreateField(nextField);
    }

    event.currentTarget.reset();
  }

  return (
    <main className="content setup-content">
      <div className="page-heading">
        <div>
          <h1>{isEditing ? "Edit Field Configuration" : "New Field Configuration"}</h1>
          <p>
            {isEditing
              ? "Update this field's location, crop, and display name for analytics."
              : "Register a field once, then run daily ET, GDD, chill, and stress analytics from maintained data feeds."}
          </p>
        </div>
        {onCancel ? (
          <button className="secondary-button page-action-button" type="button" onClick={onCancel}>
            <X size={18} />
            Cancel
          </button>
        ) : null}
      </div>

      <form className="setup-grid" onSubmit={handleSubmit}>
        <section className="panel setup-map-card">
          <h2>1. Define Field Location</h2>
          <p>Search for a ranch or drop a pin to bind weather, soil, and OpenET coordinates.</p>
          <div className="field-search-control">
            {mapboxConfig.token ? (
              <SearchBox
                accessToken={mapboxConfig.token}
                value={searchValue}
                onChange={setSearchValue}
                onRetrieve={handleSearchRetrieve}
                options={{
                  country: "US",
                  language: "en",
                  proximity: [location.lon, location.lat],
                }}
                componentOptions={{
                  allowReverse: true,
                  flipCoordinates: true,
                }}
                placeholder="Search address, ranch name, or lat/long..."
              />
            ) : (
              <label className="search-box">
                <Search size={22} />
                <input placeholder="Add VITE_MAPBOX_ACCESS_TOKEN to enable field search" disabled />
              </label>
            )}
          </div>
          <div className="map-surface">
            <Suspense fallback={<div className="map-loading">Loading map...</div>}>
              <FieldSetupMap lat={location.lat} lon={location.lon} onLocationChange={setLocation} />
            </Suspense>
          </div>
        </section>

        <aside className="setup-side">
          <section className="panel properties-card">
            <div className="property-title-row">
              <h3>Detected Properties</h3>
              <span>{soilStatus}</span>
            </div>
            <dl>
              <div>
                <dt>Soil Texture</dt>
                <dd>{detectedProperties.soilTexture}</dd>
              </div>
              {detectedProperties.soilComponentName ? (
                <div>
                  <dt>Component</dt>
                  <dd>
                    {detectedProperties.soilComponentName}
                    {detectedProperties.soilComponentPercent ? ` (${detectedProperties.soilComponentPercent}%)` : ""}
                  </dd>
                </div>
              ) : null}
              {detectedProperties.hydrologicGroup ? (
                <div>
                  <dt>Hydrologic Group</dt>
                  <dd>{detectedProperties.hydrologicGroup}</dd>
                </div>
              ) : null}
              <div>
                <dt>AWHC</dt>
                <dd>{Math.round(detectedProperties.awhcMmPerM ?? cropOptions[0].tawMmPerM)} mm/m</dd>
              </div>
              <div>
                <dt>Weather Cell</dt>
                <dd>{detectedProperties.weatherCell}</dd>
              </div>
              <div>
                <dt>Elevation</dt>
                <dd>{detectedProperties.elevationFt} ft</dd>
              </div>
            </dl>
          </section>

          <section className="panel crop-card">
            <h2>2. Select Crop</h2>
            {cropOptions.map((crop) => (
              <label key={crop.id} className="crop-option">
                <input
                  type="radio"
                  name="cropId"
                  value={crop.id}
                  checked={selectedCropId === crop.id}
                  onChange={() => setSelectedCropId(crop.id)}
                />
                <span>{crop.varietyHint ? `${crop.label} (${crop.varietyHint})` : crop.label}</span>
              </label>
            ))}
          </section>

          <section className="panel stage-threshold-card">
            <h2>3. Stage Thresholds</h2>
            <div className="stage-threshold-list">
              {selectedCrop.stages.map((stage, index) => {
                const override = field?.cropId === selectedCrop.id ? field.stageThresholds?.[index] : undefined;
                return (
                  <label key={`${selectedCrop.id}-${stage.label}`} className="stage-threshold-row">
                    <span>{stage.label}</span>
                    <input name={`stageGdd-${index}`} type="number" min="0" step="1" defaultValue={override?.gdd ?? stage.gdd} />
                  </label>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="activate-card">
          <div>
            <h2>4. Name Your Field</h2>
            <input name="fieldName" placeholder="e.g. West Orchard Sector 4" defaultValue={field?.name ?? ""} required />
          </div>
          <div>
            <h2>5. Planting / Stage Start</h2>
            <input name="plantingDate" type="date" defaultValue={field?.stageStartDate ?? ""} />
          </div>
          <button type="submit">{isEditing ? "Save Field Changes" : "Activate Field Monitoring"}</button>
        </section>
      </form>
    </main>
  );
}
