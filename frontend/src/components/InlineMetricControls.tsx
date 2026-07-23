import { SlidersHorizontal } from "lucide-react";
import { UnitToggle } from "./UnitToggle";
import type { GraphSettings } from "./graphSettings";

export type MetricView = "gdd" | "chill" | "et";
export type GddChartMode = "cumulative" | "daily";
// Chill accounting model: Dynamic Model portions (precomputed / fallback) or
// classic chill hours counted inside the crop's threshold band.
export type ChillModel = "portions" | "hours";
// Retained for persisted preferences only. The ET view is now a single combined
// water-balance chart (crop ET vs precipitation), not a set of sub-modes.
export type EtChartMode = "cropEt" | "referenceEt" | "precip";

interface InlineMetricControlsProps {
  view: MetricView;
  settings: GraphSettings;
  onChange: (next: GraphSettings) => void;
  chillRequirement?: number;
  gddChartMode: GddChartMode;
  onGddChartModeChange: (mode: GddChartMode) => void;
  chillModel: ChillModel;
  onChillModelChange: (model: ChillModel) => void;
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
  chillModel,
  onChillModelChange,
  onOpenAdvanced,
}: InlineMetricControlsProps) {
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
            <div className="inline-segmented" role="group" aria-label="Chill model">
              <button type="button" className={chillModel === "portions" ? "selected" : ""} onClick={() => onChillModelChange("portions")}>
                Chill Portions
              </button>
              <button type="button" className={chillModel === "hours" ? "selected" : ""} onClick={() => onChillModelChange("hours")}>
                Chill Hours
              </button>
            </div>
            <span className="inline-readout">{chillModel === "portions" ? "Dynamic Model" : "Hours in threshold band"}</span>
            {chillModel === "portions" && chillRequirement ? <span className="inline-readout">Requirement: {chillRequirement.toLocaleString()} CP</span> : null}
          </>
        ) : null}

        {view === "et" ? <span className="inline-readout">Water balance — crop ET vs precipitation</span> : null}
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
