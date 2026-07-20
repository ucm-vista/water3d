import type { GraphSeriesVisibility, GraphSettings } from "../components/graphSettings";
import { MAX_COMPARISON_YEARS } from "../components/graphSettings";
import type { EtChartMode, GddChartMode } from "../components/InlineMetricControls";

// Per-field chart/presentation preferences, persisted so a reload restores the
// user's setup. Deliberately EXCLUDES gddBaseTempC/gddUpperTempC and stage
// thresholds — those live on the field itself (water3d.fields.v1) and storing a
// second copy here would let the two drift apart.
export interface FieldGraphPrefs {
  /** Crop the prefs were saved under; a mismatch discards them (stale thresholds). */
  cropId: string;
  startDate?: string;
  forecastDays?: number;
  comparisonYears?: number[];
  selectedComparisonYears?: number[];
  chillThresholdMinC?: number;
  chillThresholdMaxC?: number;
  yAxisMax?: number | null;
  show?: Partial<GraphSeriesVisibility>;
  gddChartMode?: GddChartMode;
  etChartMode?: EtChartMode;
}

// Seam for account-backed preference storage: a future PocketBase
// `user_preferences` collection implements this same interface.
export interface PreferencesRepository {
  load(fieldId: string): FieldGraphPrefs | undefined;
  save(fieldId: string, prefs: FieldGraphPrefs): void;
  clear(fieldId: string): void;
}

const STORAGE_KEY = "w3d.prefs.v1";

interface PreferencesState {
  perField: Record<string, FieldGraphPrefs>;
}

function loadState(): PreferencesState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { perField: {} };
    const parsed = JSON.parse(raw) as PreferencesState;
    return parsed && typeof parsed === "object" && parsed.perField ? parsed : { perField: {} };
  } catch {
    return { perField: {} };
  }
}

function saveState(state: PreferencesState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persisting preferences is best-effort only (private mode, quota).
  }
}

export const localPreferencesRepository: PreferencesRepository = {
  load(fieldId) {
    return loadState().perField[fieldId];
  },
  save(fieldId, prefs) {
    const state = loadState();
    state.perField[fieldId] = prefs;
    saveState(state);
  },
  clear(fieldId) {
    const state = loadState();
    if (!(fieldId in state.perField)) return;
    delete state.perField[fieldId];
    saveState(state);
  },
};

// Persisted prefs win over defaults key-by-key, so settings added in later
// releases keep their defaults instead of vanishing for returning users.
export function mergeGraphSettings(
  defaults: GraphSettings,
  prefs: FieldGraphPrefs | undefined,
  context: { cropId: string; currentYear: number },
): GraphSettings {
  if (!prefs || prefs.cropId !== context.cropId) return defaults;

  const validYears = (years: number[] | undefined) =>
    years?.filter((year) => Number.isInteger(year) && year < context.currentYear);
  const comparisonYears = validYears(prefs.comparisonYears);
  const selectedComparisonYears = validYears(prefs.selectedComparisonYears)?.slice(-MAX_COMPARISON_YEARS);

  // A start-date saved in a previous season would push the chart window into
  // the wrong calendar year — only restore it within the current season.
  const startDate = prefs.startDate && prefs.startDate.slice(0, 4) === String(context.currentYear) ? prefs.startDate : undefined;

  return {
    ...defaults,
    ...(startDate ? { startDate } : {}),
    ...(typeof prefs.forecastDays === "number" ? { forecastDays: prefs.forecastDays } : {}),
    ...(comparisonYears?.length ? { comparisonYears } : {}),
    ...(selectedComparisonYears ? { selectedComparisonYears } : {}),
    ...(typeof prefs.chillThresholdMinC === "number" ? { chillThresholdMinC: prefs.chillThresholdMinC } : {}),
    ...(typeof prefs.chillThresholdMaxC === "number" ? { chillThresholdMaxC: prefs.chillThresholdMaxC } : {}),
    ...(prefs.yAxisMax !== undefined ? { yAxisMax: prefs.yAxisMax } : {}),
    show: { ...defaults.show, ...(prefs.show ?? {}) },
  };
}

export function buildFieldPrefs(
  settings: GraphSettings,
  modes: { gddChartMode: GddChartMode; etChartMode: EtChartMode },
  cropId: string,
): FieldGraphPrefs {
  return {
    cropId,
    startDate: settings.startDate,
    forecastDays: settings.forecastDays,
    comparisonYears: settings.comparisonYears,
    selectedComparisonYears: settings.selectedComparisonYears,
    chillThresholdMinC: settings.chillThresholdMinC,
    chillThresholdMaxC: settings.chillThresholdMaxC,
    yAxisMax: settings.yAxisMax,
    show: settings.show,
    gddChartMode: modes.gddChartMode,
    etChartMode: modes.etChartMode,
  };
}
