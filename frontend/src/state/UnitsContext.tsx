import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadUnitSystem, saveUnitSystem, type UnitSystem } from "../utils/units";

interface UnitsContextValue {
  unitSystem: UnitSystem;
  setUnitSystem: (unit: UnitSystem) => void;
}

const UnitsContext = createContext<UnitsContextValue | undefined>(undefined);

// App-wide unit preference (US = °F + inches, metric = °C + mm). Lives above
// the per-field graph settings so every view — header, charts, field editors,
// CSV export — reads the same value, persisted under the same localStorage key
// the per-chart toggle used previously.
export function UnitsProvider({ children }: { children: ReactNode }) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(() => loadUnitSystem());

  useEffect(() => {
    saveUnitSystem(unitSystem);
  }, [unitSystem]);

  const value = useMemo(() => ({ unitSystem, setUnitSystem }), [unitSystem]);
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const context = useContext(UnitsContext);
  if (!context) throw new Error("useUnits must be used within a UnitsProvider");
  return context;
}
