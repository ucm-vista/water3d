import { ChevronLeft, MapPin } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { cropOptions } from "../data/crops";
import { getCropMetricProfile } from "../data/cropMetrics";
import { mapConfig } from "../config/map";
import { useAutosave } from "../hooks/useAutosave";
import type { FieldConfig } from "../types/domain";
import { getCurrentYearStartDate } from "../utils/dateRange";
import { cropOptionLabel } from "./CropSelect";
import { CropCoefficientField, CropField, GeneralInfoFields, SeasonGddFields, StageThresholdsFields } from "./FieldEditorForm";
import { LocationSearch } from "./LocationSearch";

const FieldSetupMap = lazy(() => import("./FieldSetupMap"));

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
    lat: mapConfig.defaultCenter.lat,
    lon: mapConfig.defaultCenter.lon,
    stageStartDate: getCurrentYearStartDate(),
    gddBaseTempC: metrics.gdd.baseTempC,
    gddUpperTempC: metrics.gdd.upperTempC,
  };
}

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
          <div className="config-banner-title">
            <span className="config-eyebrow">Field Setup</span>
            <h1>{isEditing ? "Edit Field Configuration" : "New Field Configuration"}</h1>
          </div>
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
          <section className="config-card config-card-map">
            <div className="config-section">
              <div className="config-card-head">
                <h2>Location</h2>
              </div>
              <p className="config-card-hint">Search for a ranch or drop a pin to bind the weather grid used for GDD and chill calculations.</p>
              <div className="field-search-control">
                <LocationSearch onSelect={setLocation} placeholder="Search address, ranch name, or lat/long, then press Enter" />
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
            </div>
          </section>

          <section className="config-card config-card-data">
            <div className="config-section">
              <div className="config-card-head">
                <h2>General Information</h2>
              </div>
              <GeneralInfoFields draft={draft} onChange={setDraft} />
            </div>

            <div className="config-section">
              <div className="config-card-head">
                <h2>Crop</h2>
              </div>
              <CropField draft={draft} onChange={setDraft} />
            </div>

            <div className="config-section">
              <div className="config-card-head">
                <h2>Season &amp; GDD Model</h2>
              </div>
              <SeasonGddFields draft={draft} onChange={setDraft} />
              <CropCoefficientField draft={draft} onChange={setDraft} />
            </div>
          </section>

          <section className="config-card config-card-stages">
            <div className="config-section">
              <div className="config-card-head">
                <h2>Growth Stage Thresholds</h2>
              </div>
              <StageThresholdsFields draft={draft} onChange={setDraft} heading={false} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
