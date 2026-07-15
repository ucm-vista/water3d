import { BookOpen, ChevronLeft, Info, ListChecks, MapPin, Search } from "lucide-react";
import { SearchBox } from "@mapbox/search-js-react";
import { lazy, Suspense, useState } from "react";
import { cropOptions } from "../data/crops";
import { getCropMetricProfile } from "../data/cropMetrics";
import { mapboxConfig } from "../config/mapbox";
import { useAutosave } from "../hooks/useAutosave";
import type { FieldConfig } from "../types/domain";
import { getCurrentYearStartDate } from "../utils/dateRange";
import { cropOptionLabel } from "./CropSelect";
import { CropField, GeneralInfoFields, SeasonGddFields, StageThresholdsFields } from "./FieldEditorForm";

const FieldSetupMap = lazy(() => import("./FieldSetupMap"));

type SearchRetrieveResult = {
  features: Array<{ geometry: { coordinates: number[] } }>;
};

interface SetupPanelProps {
  onCreateField: (field: FieldConfig) => void;
  onUpdateField?: (field: FieldConfig) => void;
  /** Return to the Manage Fields list (also discards unsaved edits). */
  onCancel?: () => void;
  /** Jump to the Analytics dashboard for the relevant field. */
  onGoHome?: () => void;
  field?: FieldConfig;
}

function newFieldDraft(): FieldConfig {
  const crop = cropOptions[0];
  const metrics = getCropMetricProfile(crop.id);
  return {
    id: "",
    name: "",
    cropId: crop.id,
    cropLabel: cropOptionLabel(crop.id),
    lat: mapboxConfig.defaultCenter.lat,
    lon: mapboxConfig.defaultCenter.lon,
    stageStartDate: getCurrentYearStartDate(),
    gddBaseTempC: metrics.gdd.baseTempC,
    gddUpperTempC: metrics.gdd.upperTempC,
  };
}

// PocketBase record ids must be exactly 15 chars matching ^[a-z0-9]+$. A
// human-readable "slug-timestamp" id violates both the length and the pattern,
// so create() rejects it and the field silently falls back to local-only
// storage. Generate a PocketBase-shaped id instead.
function newFieldId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += alphabet[byte % alphabet.length];
  }
  return id;
}

export function SetupPanel({ onCreateField, onUpdateField, onCancel, onGoHome, field }: SetupPanelProps) {
  const isEditing = Boolean(field);
  const [draft, setDraft] = useState<FieldConfig>(() => field ?? newFieldDraft());
  const [searchValue, setSearchValue] = useState("");

  // When editing an existing field, autosave edits (debounced) instead of
  // requiring an explicit save. Passing `field ?? draft` as the saved snapshot
  // makes this a no-op while creating a new field (there is nothing to save
  // until the field is activated).
  useAutosave(draft, field ?? draft, (next) => {
    if (isEditing) onUpdateField?.(next);
  });

  function setLocation(location: { lat: number; lon: number }) {
    setDraft((current) => ({ ...current, lat: location.lat, lon: location.lon }));
  }

  function handleSearchRetrieve(result: SearchRetrieveResult) {
    const coordinates = result.features[0]?.geometry.coordinates;
    if (!coordinates) return;
    const [lon, lat] = coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lon)) setLocation({ lat, lon });
  }

  function handleSubmit() {
    const name = draft.name.trim() || "New Field";
    const cropLabel = draft.cropId === "other" ? draft.cropLabel.trim() || "Custom Crop" : cropOptionLabel(draft.cropId);
    const finalized: FieldConfig = { ...draft, name, cropLabel };
    if (isEditing && onUpdateField) {
      onUpdateField(finalized);
    } else {
      onCreateField({ ...finalized, id: finalized.id || newFieldId() });
    }
  }

  const canSubmit = draft.name.trim().length > 0;
  const goBack = onCancel ?? onGoHome;
  const subtitle = isEditing
    ? "Update this field's location, crop, planting date, GDD model, and growth stages. Changes save automatically."
    : "Register a field once, then track growing degree days, crop stages, and year-over-year comparisons.";

  return (
    <div className="config-page">
      <header className="config-banner">
        <div className="config-banner-lead">
          {goBack ? (
            <button type="button" className="config-back" onClick={goBack} aria-label="Go back">
              <ChevronLeft size={22} />
            </button>
          ) : null}
          <h1>{isEditing ? "Edit Field Configuration" : "New Field Configuration"}</h1>
        </div>
        <p className="config-banner-sub">{subtitle}</p>
        {isEditing ? null : (
          <div className="config-banner-actions">
            {onCancel ? (
              <button type="button" className="config-cancel-button" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
            <button type="button" className="config-save-button" onClick={handleSubmit} disabled={!canSubmit}>
              Activate Field
            </button>
          </div>
        )}
      </header>

      <main className="content config-content">
        <div className="config-grid">
          <div className="config-col">
            <section className="config-card">
              <div className="config-card-head">
                <Info size={18} aria-hidden />
                <h2>General Information</h2>
              </div>
              <GeneralInfoFields draft={draft} onChange={setDraft} />
            </section>

            <section className="config-card">
              <div className="config-card-head">
                <MapPin size={18} aria-hidden />
                <h2>Field Location</h2>
              </div>
              <p className="config-card-hint">Search for a ranch or drop a pin to bind the weather grid used for GDD and chill calculations.</p>
              <div className="field-search-control">
                {mapboxConfig.token ? (
                  <SearchBox
                    accessToken={mapboxConfig.token}
                    value={searchValue}
                    onChange={setSearchValue}
                    onRetrieve={handleSearchRetrieve}
                    options={{ country: "US", language: "en", proximity: [draft.lon, draft.lat] }}
                    componentOptions={{ allowReverse: true, flipCoordinates: true }}
                    placeholder="Search address, ranch name, or lat/long..."
                  />
                ) : (
                  <label className="search-box">
                    <Search size={22} />
                    <input placeholder="Add VITE_MAPBOX_ACCESS_TOKEN to enable field search" disabled />
                  </label>
                )}
              </div>
              <div className="map-surface config-map-surface">
                <Suspense fallback={<div className="map-loading">Loading map...</div>}>
                  <FieldSetupMap lat={draft.lat} lon={draft.lon} onLocationChange={setLocation} />
                </Suspense>
              </div>
              <p className="config-coords">
                <MapPin size={14} />
                {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}
              </p>
            </section>
          </div>

          <div className="config-col">
            <section className="config-card">
              <div className="config-card-head">
                <BookOpen size={18} aria-hidden />
                <h2>Crop &amp; GDD Model</h2>
              </div>
              <CropField draft={draft} onChange={setDraft} />
              <div className="config-card-divider" />
              <SeasonGddFields draft={draft} onChange={setDraft} />
            </section>

            <section className="config-card">
              <div className="config-card-head">
                <ListChecks size={18} aria-hidden />
                <h2>Growth Stage Thresholds</h2>
              </div>
              <StageThresholdsFields draft={draft} onChange={setDraft} heading={false} />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
