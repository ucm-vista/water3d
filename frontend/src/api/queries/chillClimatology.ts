// Precomputed winter-chill for the chill view: observed cumulative Chill
// Portions + the Oct1-anchored normal band, fetched from the Climate Toolbox and
// reduced to one per-day series. Replaces the client-side Dynamic Model
// (useChillSeries) as the primary source; callers fall back to that model when
// this returns no observed data (the observed file is year-versioned and lives
// under a testing path).

import { useQuery } from "@tanstack/react-query";
import { buildChillClimatology, type ChillClimatology } from "../../calcs/chillClimatology";
import { chillSeasonSpringYear, chillSeasonStartDate, chillToolboxConfig } from "../../config/chillToolbox";
import { fetchChillToolbox } from "../chillClimate";
import { gridMetApi } from "../gridMet";
import { weatherKeys } from "./keys";
import { TTL } from "./ttl";

interface ChillClimatologyParams {
  lat: number;
  lon: number;
  todayIso: string;
  enabled: boolean;
}

export interface ChillClimatologyResult {
  data: ChillClimatology | undefined;
  isFetching: boolean;
  isError: boolean;
}

export function useChillClimatology({ lat, lon, todayIso, enabled }: ChillClimatologyParams): ChillClimatologyResult {
  const springYear = chillSeasonSpringYear(todayIso);

  const query = useQuery({
    queryKey: weatherKeys.chillClimatology(lat, lon, springYear),
    enabled: enabled && gridMetApi.enabled,
    staleTime: TTL.chillClimatology,
    queryFn: async () => {
      const { observed, band } = await fetchChillToolbox({ lat, lon, springYear });
      return buildChillClimatology({
        observed,
        band,
        seasonStart: chillSeasonStartDate(springYear),
        baselineLabel: chillToolboxConfig.bandBaselineLabel,
      });
    },
  });

  return { data: query.data, isFetching: query.isFetching, isError: query.isError };
}
