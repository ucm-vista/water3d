import { SlidersHorizontal } from "lucide-react";
import { UnitToggle } from "./UnitToggle";
import type { GraphSettings } from "./graphSettings";

export type MetricView = "gdd" | "chill" | "et";
export type GddChartMode = "cumulative" | "daily";
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
            <span className="inline-readout">Dynamic Model (Chill Portions)</span>
            {chillRequirement ? <span className="inline-readout">Requirement: {chillRequirement.toLocaleString()} CP</span> : null}
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
