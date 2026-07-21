import { Check, MapPin, Pencil } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useAutosave } from "../hooks/useAutosave";
import type { FieldConfig } from "../types/domain";
import { FieldEditorForm } from "./FieldEditorForm";
import { FieldMapThumbnail } from "./FieldMapThumbnail";
import { LocationSearch } from "./LocationSearch";

const FieldSetupMap = lazy(() => import("./FieldSetupMap"));

interface FieldSidebarProps {
  field: FieldConfig;
  fields: FieldConfig[];
  onSelectField: (fieldId: string) => void;
  onUpdateField: (field: FieldConfig) => void;
}

// Persistent field-editing panel for the Analytics view. Holds a live working
// copy of the field (location + the shared FieldEditorForm) and autosaves edits
// (debounced) as the user changes them — no explicit Save step.
// Remounted via key={field.id} in App when the selected field changes.
export function FieldSidebar({ field, fields, onSelectField, onUpdateField }: FieldSidebarProps) {
  const [draft, setDraft] = useState<FieldConfig>(field);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  useAutosave(draft, field, onUpdateField);

  function setLocation(location: { lat: number; lon: number }) {
    setDraft((current) => ({ ...current, lat: location.lat, lon: location.lon }));
  }

  return (
    <aside className="field-sidebar" aria-label="Field setup">
      <div className="sidebar-scroll">
        <div className="sidebar-heading">
          <span className="sidebar-eyebrow">Field</span>
          <div className="sidebar-field-row">
            {isEditingName ? (
              <input
                className="sidebar-name-input"
                value={draft.name}
                aria-label="Field name"
                autoFocus
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") setIsEditingName(false);
                }}
              />
            ) : (
              <select className="sidebar-field-select" aria-label="Select field" value={field.id} onChange={(event) => onSelectField(event.target.value)}>
                {fields.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="sidebar-name-edit"
              aria-label={isEditingName ? "Done editing name" : "Edit field name"}
              aria-pressed={isEditingName}
              onClick={() => setIsEditingName((editing) => !editing)}
            >
              {isEditingName ? <Check size={16} /> : <Pencil size={15} />}
            </button>
          </div>
          <span className="sidebar-crop-label">{draft.cropLabel}</span>
        </div>

        <section className="sidebar-section">
          <h3>Location</h3>
          {isEditingLocation ? (
            <div className="sidebar-location-editor">
              <div className="field-search-control">
                <LocationSearch onSelect={setLocation} placeholder="Search address or ranch, then press Enter" />
              </div>
              <div className="sidebar-map-surface">
                <Suspense fallback={<div className="map-loading">Loading map...</div>}>
                  <FieldSetupMap lat={draft.lat} lon={draft.lon} onLocationChange={setLocation} />
                </Suspense>
              </div>
              <div className="sidebar-location-meta">
                <span>
                  {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}
                </span>
                <button type="button" className="secondary-button" onClick={() => setIsEditingLocation(false)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="sidebar-map-button" onClick={() => setIsEditingLocation(true)} aria-label="Edit field location">
              <FieldMapThumbnail lat={draft.lat} lon={draft.lon} label={draft.name} />
              <span className="sidebar-map-overlay">
                <Pencil size={14} />
                Adjust location
              </span>
              <span className="sidebar-location-coords">
                <MapPin size={13} />
                {draft.lat.toFixed(5)}, {draft.lon.toFixed(5)}
              </span>
            </button>
          )}
        </section>

        <FieldEditorForm draft={draft} onChange={setDraft} includeName={false} />
      </div>
    </aside>
  );
}
