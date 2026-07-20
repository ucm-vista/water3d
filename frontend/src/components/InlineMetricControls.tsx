import { SlidersHorizontal } from "lucide-react";
import { celsiusToDisplayTemp, displayTempToCelsius, tempUnitSuffix } from "../utils/units";
import { useUnits } from "../state/UnitsContext";
import { UnitToggle } from "./UnitToggle";
import type { GraphSettings } from "./graphSettings";

export type MetricView = "gdd" | "chill" | "et";
export type GddChartMode = "cumulative" | "daily";
// ET-view sub-mode: crop water demand, reference/atmospheric demand, or water
// supply (precipitation). One curve family at a time keeps the chart legible.
export type EtChartMode = "cropEt" | "referenceEt" | "precip";

interface InlineMetricControlsProps {
  view: MetricView;
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  chillRequirement?: number;
  gddChartMode: GddChartMode;
  onGddChartModeChange: (mode: GddChartMode) => void;
  etChartMode: EtChartMode;
  onEtChartModeChange: (mode: EtChartMode) => void;
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
  etChartMode,
  onEtChartModeChange,
  onOpenAdvanced,
}: InlineMetricControlsProps) {
  const { unitSystem } = useUnits();
  const tempSuffix = tempUnitSuffix(unitSystem);

  function patch(next: Partial<GraphSettings>) {
    onChange({ ...settings, ...next });
  }

  return (
    <div className="inline-controls">
      <div className="inline-controls-fields">
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
              <span>Chill band min (°{tempSuffix})</span>
              <input
                type="number"
                step="0.1"
                value={celsiusToDisplayTemp(settings.chillThresholdMinC, unitSystem)}
                onChange={(event) => patch({ chillThresholdMinC: displayTempToCelsius(Number(event.target.value), unitSystem) })}
              />
            </label>
            <label className="inline-field">
              <span>Chill band max (°{tempSuffix})</span>
              <input
                type="number"
                step="0.1"
                value={celsiusToDisplayTemp(settings.chillThresholdMaxC, unitSystem)}
                onChange={(event) => patch({ chillThresholdMaxC: displayTempToCelsius(Number(event.target.value), unitSystem) })}
              />
            </label>
            {chillRequirement ? <span className="inline-readout">Requirement: {chillRequirement.toLocaleString()} hrs</span> : null}
          </>
        ) : null}

        {view === "et" ? (
          <div className="inline-segmented" role="group" aria-label="ET chart series">
            <button type="button" className={etChartMode === "cropEt" ? "selected" : ""} onClick={() => onEtChartModeChange("cropEt")}>
              Crop ET
            </button>
            <button type="button" className={etChartMode === "referenceEt" ? "selected" : ""} onClick={() => onEtChartModeChange("referenceEt")}>
              Reference ET
            </button>
            <button type="button" className={etChartMode === "precip" ? "selected" : ""} onClick={() => onEtChartModeChange("precip")}>
              Precipitation
            </button>
          </div>
        ) : null}
      </div>

      <div className="inline-controls-actions">
        <UnitToggle />
        <button type="button" className="inline-advanced-button" onClick={onOpenAdvanced}>
          <SlidersHorizontal size={15} />
          Advanced
        </button>
      </div>
    </div>
  );
}
