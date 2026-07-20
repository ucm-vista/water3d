export type UnitSystem = "us" | "metric";

const STORAGE_KEY = "w3d.unitSystem";

export function gddUnitFactor(unit: UnitSystem): number {
  return unit === "us" ? 1.8 : 1;
}

export function gddUnitLabel(unit: UnitSystem): string {
  return unit === "us" ? "GDD (F)" : "GDD (C)";
}

export function celsiusToDisplayTemp(tempC: number, unit: UnitSystem): number {
  return unit === "us" ? Number(((tempC * 9) / 5 + 32).toFixed(1)) : tempC;
}

// Inverse of celsiusToDisplayTemp for unit-aware inputs. Stored values remain
// °C; rounding to 0.1 keeps °F→°C→°F round-trip drift within one displayed digit.
export function displayTempToCelsius(temp: number, unit: UnitSystem): number {
  return unit === "us" ? Number((((temp - 32) * 5) / 9).toFixed(1)) : temp;
}

export function tempUnitSuffix(unit: UnitSystem): string {
  return unit === "us" ? "F" : "C";
}

export type EtUnit = "mm" | "in";

export function etUnitForSystem(unit: UnitSystem): EtUnit {
  return unit === "us" ? "in" : "mm";
}

export function etUnitFactor(unit: EtUnit): number {
  return unit === "in" ? 1 / 25.4 : 1;
}

export function etUnitLabel(unit: EtUnit): string {
  return unit === "in" ? "in" : "mm";
}

export function loadUnitSystem(): UnitSystem {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "metric" ? "metric" : "us";
  } catch {
    return "us";
  }
}

export function saveUnitSystem(unit: UnitSystem): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // Persisting the preference is best-effort only.
  }
}
