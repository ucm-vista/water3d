import { useUnits } from "../state/UnitsContext";

// Global US/metric switch: °F + inches vs °C + mm, applied across every view.
// Lives with the chart controls (where temperature units are read most), but the
// preference itself is app-wide and persisted, so it governs every view.
export function UnitToggle({ className }: { className?: string }) {
  const { unitSystem, setUnitSystem } = useUnits();
  return (
    <div className={`inline-segmented unit-toggle${className ? ` ${className}` : ""}`} role="group" aria-label="Units">
      <button type="button" className={unitSystem === "us" ? "selected" : ""} onClick={() => setUnitSystem("us")}>
        °F
      </button>
      <button type="button" className={unitSystem === "metric" ? "selected" : ""} onClick={() => setUnitSystem("metric")}>
        °C
      </button>
    </div>
  );
}
