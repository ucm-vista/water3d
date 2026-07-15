import { SlidersHorizontal } from "lucide-react";
import type { GraphSettings } from "./graphSettings";

export type MetricView = "gdd" | "chill" | "et";
export type GddChartMode = "cumulative" | "daily";

interface InlineMetricControlsProps {
  view: MetricView;
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  chillRequirement?: number;
  gddChartMode: GddChartMode;
  onGddChartModeChange: (mode: GddChartMode) => void;
  onOpenAdvanced: () => void;
}

// The compact, always-visible control row above the chart. It exposes only the
// essentials for the active metric and writes straight through to live
// settings, so the chart updates in real time. Everything else lives behind the
// Advanced button.
export function InlineMetricControls({
  view,
  settings,
  onChange,
  chillRequirement,
  gddChartMode,
  onGddChartModeChange,
  onOpenAdvanced,
}: InlineMetricControlsProps) {
  function patch(next: Partial<GraphSettings>) {
    onChange({ ...settings, ...next });
  }

  return (
    <div className="inline-controls">
      <div className="inline-controls-fields">
        {view === "gdd" ? <UnitToggle settings={settings} onChange={onChange} /> : null}

        {view === "gdd" ? (
          <div className="inline-segmented" role="group" aria-label="GDD chart type">
            <button type="button" className={gddChartMode === "cumulative" ? "selected" : ""} onClick={() => onGddChartModeChange("cumulative")}>
              Cumulative
            </button>
            <button type="button" className={gddChartMode === "daily" ? "selected" : ""} onClick={() => onGddChartModeChange("daily")}>
              Daily
            </button>
          </div>
        ) : null}

        {view === "chill" ? (
          <>
            <label className="inline-field">
              <span>Min °C</span>
              <input
                type="number"
                step="0.1"
                value={settings.chillThresholdMinC}
                onChange={(event) => patch({ chillThresholdMinC: Number(event.target.value) })}
              />
            </label>
            <label className="inline-field">
              <span>Max °C</span>
              <input
                type="number"
                step="0.1"
                value={settings.chillThresholdMaxC}
                onChange={(event) => patch({ chillThresholdMaxC: Number(event.target.value) })}
              />
            </label>
            {chillRequirement ? <span className="inline-readout">Requirement: {chillRequirement.toLocaleString()} hrs</span> : null}
          </>
        ) : null}

        {view === "et" ? (
          <div className="inline-segmented" role="group" aria-label="ET units">
            <button type="button" className={settings.etUnit === "mm" ? "selected" : ""} onClick={() => patch({ etUnit: "mm" })}>
              mm
            </button>
            <button type="button" className={settings.etUnit === "in" ? "selected" : ""} onClick={() => patch({ etUnit: "in" })}>
              in
            </button>
          </div>
        ) : null}
      </div>

      <button type="button" className="inline-advanced-button" onClick={onOpenAdvanced}>
        <SlidersHorizontal size={15} />
        Advanced
      </button>
    </div>
  );
}

function UnitToggle({ settings, onChange }: { settings: GraphSettings; onChange: (next: GraphSettings) => void }) {
  return (
    <div className="inline-segmented" role="group" aria-label="GDD units">
      <button
        type="button"
        className={settings.unitSystem === "us" ? "selected" : ""}
        onClick={() => onChange({ ...settings, unitSystem: "us" })}
      >
        °F
      </button>
      <button
        type="button"
        className={settings.unitSystem === "metric" ? "selected" : ""}
        onClick={() => onChange({ ...settings, unitSystem: "metric" })}
      >
        °C
      </button>
    </div>
  );
}
