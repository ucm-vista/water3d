import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { FieldConfig } from "../types/domain";
import { FieldMapThumbnail } from "./FieldMapThumbnail";
import { SetupPanel } from "./SetupPanel";

interface FieldManagerProps {
  fields: FieldConfig[];
  selectedFieldId: string;
  onSelectField: (fieldId: string) => void;
  onCreateField: (field: FieldConfig) => void;
  onUpdateField: (field: FieldConfig) => void;
}

export function FieldManager({ fields, selectedFieldId, onSelectField, onCreateField, onUpdateField }: FieldManagerProps) {
  const [isAddingField, setIsAddingField] = useState(fields.length === 0);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const editingField = fields.find((field) => field.id === editingFieldId);

  function handleCreateField(field: FieldConfig) {
    onCreateField(field);
    setIsAddingField(false);
  }

  function handleUpdateField(field: FieldConfig) {
    onUpdateField(field);
    setEditingFieldId(null);
  }

  if (editingField) {
    return <SetupPanel field={editingField} onCreateField={onCreateField} onUpdateField={handleUpdateField} onCancel={() => setEditingFieldId(null)} />;
  }

  if (isAddingField) {
    return <SetupPanel onCreateField={handleCreateField} onCancel={fields.length > 0 ? () => setIsAddingField(false) : undefined} />;
  }

  return (
    <main className="content field-manager-content">
      <div className="page-heading">
        <div>
          <h1>Manage Fields</h1>
          <p>Select an existing field for analytics or add a new field from a setup map pin.</p>
        </div>
        <button className="primary-button page-action-button" onClick={() => setIsAddingField(true)}>
          <Plus size={18} />
          Add Field
        </button>
      </div>

      <section className="field-list panel">
        {fields.map((field) => (
          <button
            key={field.id}
            className={`field-row ${field.id === selectedFieldId ? "field-row-active" : ""}`}
            onClick={() => onSelectField(field.id)}
          >
            <FieldMapThumbnail lat={field.lat} lon={field.lon} label={field.name} />
            <div className="field-row-main">
              <strong>{field.name}</strong>
              <span>{field.cropLabel}</span>
            </div>
            <dl className="field-row-data">
              <div>
                <dt>Soil</dt>
                <dd>{field.soilComponentName ?? field.soilTexture}</dd>
              </div>
              <div>
                <dt>Texture / AWHC</dt>
                <dd>
                  {field.soilTexture} - {Math.round(field.awhcMmPerM)} mm/m
                </dd>
              </div>
              <div>
                <dt>NRCS Map Unit</dt>
                <dd>{field.soilMapUnitKey ? `${field.soilMapUnitKey}${field.hydrologicGroup ? ` - HSG ${field.hydrologicGroup}` : ""}` : "Local default"}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  {field.lat.toFixed(3)}, {field.lon.toFixed(3)}
                </dd>
              </div>
            </dl>
            <span
              className="field-edit-button"
              role="button"
              tabIndex={0}
              aria-label={`Edit ${field.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setEditingFieldId(field.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditingFieldId(field.id);
                }
              }}
            >
              <Pencil size={16} />
              Edit
            </span>
          </button>
        ))}
      </section>
    </main>
  );
}
