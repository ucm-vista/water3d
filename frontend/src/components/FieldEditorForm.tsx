import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { getCropMetricProfile } from "../data/cropMetrics";
import { cropProfiles } from "../data/crops";
import { useUnits } from "../state/UnitsContext";
import type { CropId, FieldConfig, StageThreshold } from "../types/domain";
import { celsiusToDisplayTemp, displayTempToCelsius, tempUnitSuffix } from "../utils/units";
import { CropSelect, cropOptionLabel } from "./CropSelect";

interface FieldEditorFormProps {
  /** Fully-controlled working copy of the field. */
  draft: FieldConfig;
  onChange: (next: FieldConfig) => void;
  /** Render the field-name input (hidden when the name is edited elsewhere, e.g. the sidebar heading). */
  includeName?: boolean;
}

interface FieldFieldsProps {
  draft: FieldConfig;
  onChange: (next: FieldConfig) => void;
}

// Field name. Pulled out so the analytics sidebar and the setup page can frame
// it differently (its own "General Information" card on setup).
export function GeneralInfoFields({ draft, onChange }: FieldFieldsProps) {
  function patch(next: Partial<FieldConfig>) {
    onChange({ ...draft, ...next });
  }

  return (
    <div className="parameter-grid parameter-grid-narrow">
      <label>
        <span>Field name</span>
        <input value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="e.g. West Orchard Sector 4" />
      </label>
    </div>
  );
}

// Crop picker. Switching crops swaps the GDD model + stage list, so reset those
// controls to the new crop's defaults rather than carrying over mismatched values.
// Selecting "Other" exposes a free-text crop name the user supplies themselves.
export function CropField({ draft, onChange }: FieldFieldsProps) {
  function handleCropChange(nextCropId: CropId) {
    if (nextCropId === draft.cropId) return;
    const nextMetrics = getCropMetricProfile(nextCropId);
    onChange({
      ...draft,
      cropId: nextCropId,
      cropLabel: nextCropId === "other" ? "" : cropOptionLabel(nextCropId),
      gddBaseTempC: nextMetrics.gdd.baseTempC,
      gddUpperTempC: nextMetrics.gdd.upperTempC,
      kcOverride: undefined,
      stageThresholds: undefined,
    });
  }

  return (
    <>
      <CropSelect value={draft.cropId} onChange={handleCropChange} id="editor-crop-select" />
      {draft.cropId === "other" ? (
        <label className="custom-crop-name">
          <span>Custom crop name</span>
          <input
            value={draft.cropLabel}
            onChange={(event) => onChange({ ...draft, cropLabel: event.target.value })}
            placeholder="e.g. Sorghum"
          />
        </label>
      ) : null}
    </>
  );
}

// Planting/biofix date + the GDD base/upper temperatures. Thresholds are stored
// in °C; the inputs display and accept the global unit system's temperature.
export function SeasonGddFields({ draft, onChange }: FieldFieldsProps) {
  const cropMetrics = getCropMetricProfile(draft.cropId);
  const { unitSystem } = useUnits();
  const tempSuffix = tempUnitSuffix(unitSystem);

  function patch(next: Partial<FieldConfig>) {
    onChange({ ...draft, ...next });
  }

  return (
    <>
      <p className="editor-hint">{cropMetrics.gdd.biofixLabel}</p>
      <div className="parameter-grid parameter-grid-narrow">
        <label>
          <span>Plant / Biofix Date</span>
          <input
            type="date"
            value={draft.stageStartDate}
            onChange={(event) => event.target.value && patch({ stageStartDate: event.target.value })}
          />
        </label>
      </div>
      <div className="parameter-grid parameter-grid-pair">
        <label>
          <span>GDD base temp{"\u00A0"}(&deg;{tempSuffix})</span>
          <input
            type="number"
            step="0.1"
            value={celsiusToDisplayTemp(draft.gddBaseTempC ?? cropMetrics.gdd.baseTempC, unitSystem)}
            onChange={(event) => patch({ gddBaseTempC: displayTempToCelsius(Number(event.target.value), unitSystem) })}
          />
        </label>
        <label>
          <span>GDD upper cutoff{"\u00A0"}(&deg;{tempSuffix})</span>
          <input
            type="number"
            step="0.1"
            value={celsiusToDisplayTemp(draft.gddUpperTempC ?? cropMetrics.gdd.upperTempC, unitSystem)}
            onChange={(event) => patch({ gddUpperTempC: displayTempToCelsius(Number(event.target.value), unitSystem) })}
          />
        </label>
      </div>
      <p className="editor-hint">Temperature thresholds for degree-day accumulation &mdash; not daily min/max temperatures.</p>
    </>
  );
}

// Crop coefficient (Kc) override. ETc = ETo × Kc; by default Kc follows the
// research-paper stage curve for the crop, but reviewers asked that users be
// able to see and set it themselves. Blank = use the built-in curve.
export function CropCoefficientField({ draft, onChange }: FieldFieldsProps) {
  const cropProfile = cropProfiles[draft.cropId];
  const curveRange = cropProfile
    ? `${Math.min(...cropProfile.kcCurve.map((point) => point.kc)).toFixed(2)}–${Math.max(...cropProfile.kcCurve.map((point) => point.kc)).toFixed(2)}`
    : undefined;

  return (
    <>
      <div className="parameter-grid parameter-grid-narrow">
        <label>
          <span>Crop coefficient (Kc)</span>
          <input
            type="number"
            step="0.05"
            min="0"
            value={draft.kcOverride ?? ""}
            placeholder={curveRange ? `Stage curve (${curveRange})` : "Stage curve"}
            onChange={(event) => onChange({ ...draft, kcOverride: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) })}
          />
        </label>
      </div>
      <p className="editor-hint">
        Crop ET = reference ETo &times; Kc. Leave blank to follow the built-in stage-varying curve; enter a value to apply one flat Kc instead.
      </p>
    </>
  );
}

interface StageThresholdsFieldsProps extends FieldFieldsProps {
  /** Render the built-in "Growth Stage Thresholds" heading. Disable when the
      surrounding card already supplies its own heading (e.g. the setup page). */
  heading?: boolean;
}

// Editable growth-stage list. Stages default to the crop profile until the user
// edits them; the first change promotes the field to a custom stage list.
export function StageThresholdsFields({ draft, onChange, heading = true }: StageThresholdsFieldsProps) {
  const cropMetrics = getCropMetricProfile(draft.cropId);
  const isCustomized = Boolean(draft.stageThresholds?.length);
  const stages = isCustomized ? draft.stageThresholds! : cropMetrics.gdd.stages;

  function patch(next: Partial<FieldConfig>) {
    onChange({ ...draft, ...next });
  }

  function commitStages(next: StageThreshold[]) {
    patch({ stageThresholds: next });
  }

  function updateStage(index: number, change: Partial<StageThreshold>) {
    commitStages(stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...change } : stage)));
  }

  function deleteStage(index: number) {
    commitStages(stages.filter((_, stageIndex) => stageIndex !== index));
  }

  function addStage() {
    const lastNumeric = [...stages].reverse().find((stage) => typeof stage.gdd === "number")?.gdd ?? 0;
    commitStages([...stages, { label: "New stage", gdd: lastNumeric + 100 }]);
  }

  function resetStages() {
    patch({ stageThresholds: undefined });
  }

  const resetLink = isCustomized ? (
    <button type="button" className="stage-reset-link" onClick={resetStages}>
      <RotateCcw size={13} />
      Reset to defaults
    </button>
  ) : null;

  return (
    <>
      {heading ? (
        <div className="stage-section-header">
          <h3>Growth Stage Thresholds</h3>
          {resetLink}
        </div>
      ) : resetLink ? (
        <div className="stage-section-header stage-section-header-bare">{resetLink}</div>
      ) : null}
      <p className="editor-hint">Edit a stage's GDD or name to customize. Add or remove stages as needed.</p>
      <div className="stage-edit-list">
        {stages.map((stage, index) => (
          <div key={index} className="stage-edit-row">
            <input
              className="stage-edit-label"
              value={stage.label}
              aria-label={`Stage ${index + 1} name`}
              onChange={(event) => updateStage(index, { label: event.target.value })}
            />
            <input
              className="stage-edit-gdd"
              type="number"
              min="0"
              step="1"
              value={stage.gdd ?? ""}
              aria-label={`Stage ${index + 1} GDD`}
              placeholder="--"
              onChange={(event) => updateStage(index, { gdd: event.target.value === "" ? null : Number(event.target.value) })}
            />
            <button type="button" className="stage-delete-button" aria-label={`Delete ${stage.label}`} onClick={() => deleteStage(index)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="stage-add-button" onClick={addStage}>
        <Plus size={14} />
        Add stage
      </button>
    </>
  );
}

// The non-location attributes of a field (name, crop, season/GDD model,
// stage thresholds). Location is edited separately, so this form is reused by
// the analytics sidebar and the field setup page.
export function FieldEditorForm({ draft, onChange, includeName = true }: FieldEditorFormProps) {
  return (
    <div className="field-editor">
      {includeName ? (
        <section className="editor-section">
          <h3>Field</h3>
          <GeneralInfoFields draft={draft} onChange={onChange} />
        </section>
      ) : null}

      <section className="editor-section">
        <h3>Crop</h3>
        <CropField draft={draft} onChange={onChange} />
      </section>

      <section className="editor-section">
        <h3>Season &amp; GDD Model</h3>
        <SeasonGddFields draft={draft} onChange={onChange} />
        <CropCoefficientField draft={draft} onChange={onChange} />
      </section>

      <section className="editor-section">
        <StageThresholdsFields draft={draft} onChange={onChange} />
      </section>
    </div>
  );
}
