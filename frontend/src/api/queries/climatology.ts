// 30-year climatology: the "normal" curves and percentile bands behind the
// GDD/ETo overlays. Two-layer design:
//
//  - RAW: one gridMET request per variable spanning the whole 30-year window
//    (each variable lives in a single aggregated 1979→present file, so a
//    multi-decade pull is still one extraction). ~11k daily records — kept
//    in-memory only (`meta.persist: false`) so it never touches the ~5 MB
//    localStorage quota, and only fetched when the derived stats are missing.
//  - DERIVED: `buildClimatologyStats` reduces the raw records to ~366 per-day
//    stat rows (tens of KB). This is what persists, so a reload restores the
//    normals instantly without refetching 30 years. Crop-threshold edits
//    recompute from the in-memory raw query without another network trip.
//
// Provider seam: when Katherine's pre-computed climatology endpoint ships,
// swap the raw queryFn for her endpoint (or replace the reduction entirely) —
// consumers only see `ClimatologyStats`.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildClimatologyStats, type ClimatologyStats } from "../../calcs/climatology";
import { gridMetApi, gridMetProvider } from "../gridMet";
import { weatherKeys } from "./keys";
import { TTL } from "./ttl";

export const CLIMATOLOGY_YEARS = 30;

interface ClimatologyParams {
  lat: number;
  lon: number;
  currentYear: number;
  gddBaseTempC: number;
  gddUpperTempC: number;
  /** "MM-DD" the cumulative curves restart at (the season biofix). */
  alignStartMonthDay: string;
}

export interface ClimatologyResult {
  stats: ClimatologyStats | undefined;
  isFetching: boolean;
  isError: boolean;
}

export function useClimatology(params: ClimatologyParams): ClimatologyResult {
  const { lat, lon, currentYear, gddBaseTempC, gddUpperTempC, alignStartMonthDay } = params;
  const startYear = currentYear - CLIMATOLOGY_YEARS;
  const endYear = currentYear - 1;
  const queryClient = useQueryClient();

  const statsKey = [
    "calc",
    "climatology",
    {
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      startYear,
      endYear,
      base: gddBaseTempC,
      upper: gddUpperTempC,
      align: alignStartMonthDay,
    },
  ] as const;
  const restoredStats = queryClient.getQueryData<ClimatologyStats>(statsKey);

  const rawQuery = useQuery({
    queryKey: weatherKeys.climatologyRaw(lat, lon, startYear, endYear),
    enabled: gridMetApi.enabled && restoredStats === undefined,
    staleTime: TTL.climatologyWeather,
    meta: { persist: false },
    queryFn: () =>
      gridMetProvider.getDailyWeather({
        cropId: "other",
        lat,
        lon,
        startDate: `${startYear}-01-01`,
        endDate: `${endYear}-12-31`,
        variableProfile: "climatology",
      }),
  });
  const rawRecords = rawQuery.data?.records;

  const statsQuery = useQuery({
    queryKey: statsKey,
    enabled: Boolean(rawRecords?.length),
    staleTime: Infinity,
    queryFn: async () =>
      buildClimatologyStats(rawRecords ?? [], { startYear, endYear, gddBaseTempC, gddUpperTempC, alignStartMonthDay }),
  });

  return {
    stats: statsQuery.data,
    isFetching: rawQuery.isFetching || statsQuery.isFetching,
    isError: rawQuery.isError,
  };
}
