import type { WeatherRecord } from "../types/domain";

// Fishman–Erez Dynamic Model of winter chill (Erez et al. 1990). Unlike the
// Chill Hours model (count hours in a fixed temperature band), the Dynamic Model
// treats chilling as a two-step process: cold hours build an unstable
// intermediate product, and only once that intermediate crosses a threshold does
// a fraction of it convert into a permanent "chill portion". Warm hours can
// destroy the intermediate before it banks, which is why the model stays
// accurate in warm-winter climates like California's Central Valley where the
// Chill Hours / Utah models break down.
//
// Constants and per-hour recurrence match the canonical chillR/ChillModels
// implementation (Dynamic_Model). See temp_models.R in cran/chillR.
const E0 = 4153.5;
const E1 = 12888.8;
const A0 = 139500;
const A1 = 2.567e18;
const SLOPE = 1.6;
const TETMLT = 277;
const AA = A0 / A1;
const EE = E1 - E0;

export interface DynamicModelState {
  /** Intermediate product carried into the next hour (interE / E in chillR). */
  interE: number;
  /** Completion fraction (xi) from the previous hour, used to release the intermediate. */
  xi: number;
  /** Cumulative chill portions accumulated so far. */
  portions: number;
}

export function initialDynamicState(): DynamicModelState {
  return { interE: 0, xi: 0, portions: 0 };
}

/**
 * Advance the Dynamic Model by one hour and return the new state. Pure: the
 * input state is not mutated. `state.portions` is the running cumulative Chill
 * Portions after this hour.
 */
export function stepDynamicModel(state: DynamicModelState, tempC: number): DynamicModelState {
  const tk = tempC + 273;
  const ftmprt = (SLOPE * TETMLT * (tk - TETMLT)) / tk;
  const sr = Math.exp(ftmprt);
  const xi = sr / (1 + sr);
  const xs = AA * Math.exp(EE / tk);
  const ak1 = A1 * Math.exp(-E1 / tk);

  // Once the intermediate has crossed 1 it has begun banking a portion, so the
  // previous hour's completed fraction is removed from the carried intermediate.
  const s = state.interE < 1 ? state.interE : state.interE - state.interE * state.xi;
  const interE = xs - (xs - s) * Math.exp(-ak1);
  const delta = interE >= 1 ? interE * xi : 0;

  return { interE, xi, portions: state.portions + delta };
}

/** 24 hourly temperatures for a record: measured hourly data, or a sine fallback
 *  reconstructing the diurnal cycle from the daily min/max (same curve used by
 *  interpolateHourlyTemps in climate.ts). */
function hourlyTempsForRecord(record: WeatherRecord): number[] {
  if (record.hourlyTempsC?.length) return record.hourlyTempsC;

  const mean = (record.tminC + record.tmaxC) / 2;
  const amplitude = (record.tmaxC - record.tminC) / 2;
  return Array.from({ length: 24 }, (_, hour) => {
    const radians = ((hour - 9) / 24) * Math.PI * 2;
    return mean + amplitude * Math.sin(radians);
  });
}

export interface ChillPortionPoint {
  date: string;
  dailyPortions: number;
  cumulativePortions: number;
}

/**
 * Cumulative Chill Portions across a chronologically-sorted record series. The
 * model is stateful across hour and day boundaries, so this runs one continuous
 * hourly stream over the whole series rather than summing per-day results.
 */
export function cumulativeChillPortions(records: WeatherRecord[]): ChillPortionPoint[] {
  let state = initialDynamicState();

  return records.map((record) => {
    const startPortions = state.portions;
    for (const temp of hourlyTempsForRecord(record)) {
      state = stepDynamicModel(state, temp);
    }
    return {
      date: record.date,
      dailyPortions: Number((state.portions - startPortions).toFixed(3)),
      cumulativePortions: Number(state.portions.toFixed(2)),
    };
  });
}
