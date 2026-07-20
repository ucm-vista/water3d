import { ChevronRight, RotateCcw } from "lucide-react";
import { celsiusToDisplayTemp, displayTempToCelsius, gddUnitFactor, gddUnitLabel, tempUnitSuffix } from "../utils/units";
import { useUnits } from "../state/UnitsContext";
import type { MetricView } from "./InlineMetricControls";
import { Modal } from "./Modal";
import {
  FORECAST_RANGE_OPTIONS,
  MAX_COMPARISON_YEARS,
  type GraphSeriesVisibility,
  type GraphSettings,
} from "./graphSettings";

interface AdvancedGraphSettingsProps {
  open: boolean;
  view: MetricView;
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  onClose: () => void;
  onReset: () => void;
  seasonStartDate: string;
  todayIso: string;
  minYear: number;
  maxYear: number;
  biofixLabel: string;
  onEditStages?: () => void;
}

const TOGGLE_LABELS: Partial<Record<keyof GraphSeriesVisibility, string>> = {
  stages: "Show crop stages",
  stageLabels: "Show stage labels",
  currentSeason: "Show current season",
  forecast: "Show forecast extension",
  projection: "Show projection to year-end",
  dataMarkers: "Show data-point markers",
  climatologyNormal: "Show 30-yr normal",
  climatologyBand: "Show 30-yr P10–P90 band",
  etReferencePriorYear: "Show prior-year reference ETo",
  etReferenceNormal: "Show 30-yr average reference ETo",
  etDailyBars: "Show daily ET bars",
  forecastBand: "Show forecast uncertainty band",
  precipDailyBars: "Show daily precipitation bars",
  precipNormal: "Show 30-yr average precipitation",
  precipBand: "Show 30-yr P10–P90 precipitation band",
};

// Advanced, less-common graph options. All controls write straight through to
// live settings (no Apply gate) — the chart updates as you change them.
export function AdvancedGraphSettings({
  open,
  view,
  settings,
  onChange,
  onClose,
  onReset,
  seasonStartDate,
  todayIso,
  minYear,
  maxYear,
  biofixLabel,
  onEditStages,
}: AdvancedGraphSettingsProps) {
  const { unitSystem } = useUnits();
  const unitFactor = gddUnitFactor(unitSystem);
  const unitLabel = gddUnitLabel(unitSystem);
  const tempSuffix = tempUnitSuffix(unitSystem);

  const availableYears: number[] = [];
  for (let year = maxYear; year >= minYear; year--) {
    if (!settings.comparisonYears.includes(year)) {
      availableYears.push(year);
    }
  }

  function update(patch: Partial<GraphSettings>) {
    onChange({ ...settings, ...patch });
  }

  function toggleShow(key: keyof GraphSeriesVisibility) {
    update({ show: { ...settings.show, [key]: !settings.show[key] } });
  }

  const atSelectionLimit = settings.selectedComparisonYears.length >= MAX_COMPARISON_YEARS;

  const modalTitle =
    view === "et" ? "Advanced ET Settings" : view === "chill" ? "Advanced Chill Settings" : "Advanced GDD Settings";

  const forecastRangeField = (
    <label>
      <span>Forecast range</span>
      <select value={settings.forecastDays} onChange={(event) => update({ forecastDays: Number(event.target.value) })}>
        {FORECAST_RANGE_OPTIONS.map((days) => (
          <option key={days} value={days}>
            {days === 0 ? "No forecast" : `+${days} days`}
          </option>
        ))}
      </select>
    </label>
  );

  function toggleYear(year: number) {
    const selected = settings.selectedComparisonYears.includes(year);
    if (!selected && atSelectionLimit) return;
    update({
      selectedComparisonYears: selected
        ? settings.selectedComparisonYears.filter((item) => item !== year)
        : [...settings.selectedComparisonYears, year],
    });
  }

  function removeYear(year: number) {
    update({
      comparisonYears: settings.comparisonYears.filter((item) => item !== year),
      selectedComparisonYears: settings.selectedComparisonYears.filter((item) => item !== year),
    });
  }

  function addYear(year: number) {
    if (!Number.isInteger(year) || settings.comparisonYears.includes(year)) return;
    const nextSelected =
      settings.selectedComparisonYears.length < MAX_COMPARISON_YEARS
        ? [...settings.selectedComparisonYears, year]
        : settings.selectedComparisonYears;
    update({
      comparisonYears: [...settings.comparisonYears, year].sort((l, r) => l - r),
      selectedComparisonYears: nextSelected,
    });
  }

  return (
    <Modal
      open={open}
      title={modalTitle}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <button type="button" className="link-button settings-reset" onClick={onReset}>
            <RotateCcw size={14} />
            Reset to defaults
          </button>
          <div className="modal-footer-actions">
            <button type="button" className="primary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      }
    >
      <div className="advanced-settings-grid">
        {view === "gdd" ? (
          <>
            <section className="settings-section">
              <h3>Season Window</h3>
              <div className="settings-field-grid">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={settings.startDate}
                    min={seasonStartDate}
                    max={settings.endDate || todayIso}
                    onChange={(event) => event.target.value && update({ startDate: event.target.value })}
                  />
                </label>
                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={settings.endDate}
                    min={settings.startDate}
                    max={todayIso}
                    onChange={(event) => event.target.value && update({ endDate: event.target.value })}
                  />
                </label>
                {forecastRangeField}
              </div>
              <p className="settings-hint">{biofixLabel}</p>
            </section>

            <section className="settings-section">
              <h3>Comparison Years</h3>
              <p className="settings-hint">Overlay up to {MAX_COMPARISON_YEARS} prior seasons (last year is shown by default).</p>
              <div className="settings-year-list">
                {settings.comparisonYears.map((year) => {
                  const checked = settings.selectedComparisonYears.includes(year);
                  return (
                    <div key={year} className="settings-year-row">
                      <label className={!checked && atSelectionLimit ? "is-disabled" : ""}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && atSelectionLimit}
                          onChange={() => toggleYear(year)}
                        />
                        <span>{year}</span>
                      </label>
                      <button type="button" className="link-button" aria-label={`Remove ${year}`} onClick={() => removeYear(year)}>
                        Remove
                      </button>
                    </div>
                  );
                })}
                {settings.comparisonYears.length === 0 ? <p className="settings-hint">No comparison years listed.</p> : null}
              </div>
              <div className="settings-add-year">
                <select
                  className="settings-year-select"
                  aria-label="Add a comparison year"
                  value=""
                  disabled={availableYears.length === 0}
                  onChange={(event) => {
                    if (event.target.value !== "") addYear(Number(event.target.value));
                  }}
                >
                  <option value="" disabled>
                    {availableYears.length ? "Add a comparison year…" : "All available years added"}
                  </option>
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="settings-section">
              <h3>Stages</h3>
              <Toggle label={TOGGLE_LABELS.stages!} checked={settings.show.stages} onChange={() => toggleShow("stages")} />
              <Toggle label={TOGGLE_LABELS.stageLabels!} checked={settings.show.stageLabels} onChange={() => toggleShow("stageLabels")} />
              {onEditStages ? (
                <button type="button" className="link-button settings-edit-stages" onClick={onEditStages}>
                  Edit stage thresholds
                  <ChevronRight size={14} />
                </button>
              ) : null}
            </section>

            <section className="settings-section">
              <h3>Display</h3>
              <Toggle label={TOGGLE_LABELS.currentSeason!} checked={settings.show.currentSeason} onChange={() => toggleShow("currentSeason")} />
              <Toggle label={TOGGLE_LABELS.forecast!} checked={settings.show.forecast} onChange={() => toggleShow("forecast")} />
              <Toggle label={TOGGLE_LABELS.projection!} checked={settings.show.projection} onChange={() => toggleShow("projection")} />
              <Toggle label={TOGGLE_LABELS.climatologyNormal!} checked={settings.show.climatologyNormal} onChange={() => toggleShow("climatologyNormal")} />
              <Toggle label={TOGGLE_LABELS.climatologyBand!} checked={settings.show.climatologyBand} onChange={() => toggleShow("climatologyBand")} />
              <Toggle label={TOGGLE_LABELS.dataMarkers!} checked={settings.show.dataMarkers} onChange={() => toggleShow("dataMarkers")} />
            </section>

            <section className="settings-section">
              <h3>Axis</h3>
              <label className="settings-inline-field">
                <span>Y-axis max ({unitLabel})</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Auto"
                  value={settings.yAxisMax === null ? "" : Math.round(settings.yAxisMax * unitFactor)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update({ yAxisMax: null });
                      return;
                    }
                    const next = Number(raw);
                    if (Number.isFinite(next)) update({ yAxisMax: Math.max(0, next / unitFactor) });
                  }}
                />
              </label>
            </section>
          </>
        ) : null}

        {view === "et" ? (
          <>
            <section className="settings-section">
              <h3>Season Window</h3>
              <div className="settings-field-grid">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={settings.startDate}
                    min={seasonStartDate}
                    max={settings.endDate || todayIso}
                    onChange={(event) => event.target.value && update({ startDate: event.target.value })}
                  />
                </label>
                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={settings.endDate}
                    min={settings.startDate}
                    max={todayIso}
                    onChange={(event) => event.target.value && update({ endDate: event.target.value })}
                  />
                </label>
                {forecastRangeField}
              </div>
            </section>

            <section className="settings-section">
              <h3>Year-over-year comparison</h3>
              <p className="settings-hint">
                Overlay reference ETo (atmospheric demand) from prior seasons, aligned to this season by calendar day, so you can
                see whether this year is running thirstier or milder than usual.
              </p>
              <Toggle label={TOGGLE_LABELS.etReferencePriorYear!} checked={settings.show.etReferencePriorYear} onChange={() => toggleShow("etReferencePriorYear")} />
              <Toggle label={TOGGLE_LABELS.etReferenceNormal!} checked={settings.show.etReferenceNormal} onChange={() => toggleShow("etReferenceNormal")} />
              <p className="settings-hint">Which prior years overlay is shared with the GDD view’s Comparison Years.</p>
            </section>

            <section className="settings-section">
              <h3>Daily ET Bars</h3>
              <p className="settings-hint">Per-day crop ET drawn as bars on the right axis. Units follow the global °F/°C toggle above the chart.</p>
              <Toggle label={TOGGLE_LABELS.etDailyBars!} checked={settings.show.etDailyBars} onChange={() => toggleShow("etDailyBars")} />
            </section>

            <section className="settings-section">
              <h3>Precipitation</h3>
              <p className="settings-hint">
                Water supply for the Precipitation sub-mode: daily totals as bars, plus the 30-yr average and P10–P90 band of
                cumulative precipitation from gridMET history.
              </p>
              <Toggle label={TOGGLE_LABELS.precipDailyBars!} checked={settings.show.precipDailyBars} onChange={() => toggleShow("precipDailyBars")} />
              <Toggle label={TOGGLE_LABELS.precipNormal!} checked={settings.show.precipNormal} onChange={() => toggleShow("precipNormal")} />
              <Toggle label={TOGGLE_LABELS.precipBand!} checked={settings.show.precipBand} onChange={() => toggleShow("precipBand")} />
            </section>

            <section className="settings-section">
              <h3>Forecast</h3>
              <Toggle label={TOGGLE_LABELS.forecast!} checked={settings.show.forecast} onChange={() => toggleShow("forecast")} />
              <Toggle label={TOGGLE_LABELS.forecastBand!} checked={settings.show.forecastBand} onChange={() => toggleShow("forecastBand")} />
            </section>
          </>
        ) : null}

        {view === "chill" ? (
          <section className="settings-section">
            <h3>Chill Thresholds</h3>
            <p className="settings-hint">Hours are counted when the temperature falls between these bounds.</p>
            <div className="settings-field-grid">
              <label>
                <span>Chill band min (°{tempSuffix})</span>
                <input
                  type="number"
                  step="0.1"
                  value={celsiusToDisplayTemp(settings.chillThresholdMinC, unitSystem)}
                  onChange={(event) => update({ chillThresholdMinC: displayTempToCelsius(Number(event.target.value), unitSystem) })}
                />
              </label>
              <label>
                <span>Chill band max (°{tempSuffix})</span>
                <input
                  type="number"
                  step="0.1"
                  value={celsiusToDisplayTemp(settings.chillThresholdMaxC, unitSystem)}
                  onChange={(event) => update({ chillThresholdMaxC: displayTempToCelsius(Number(event.target.value), unitSystem) })}
                />
              </label>
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="settings-toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="settings-toggle-track" aria-hidden="true" />
      <span className="settings-toggle-label">{label}</span>
    </label>
  );
}
