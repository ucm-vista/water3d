# Water3D — Chill API integration (current overview)

_Last updated 2026-07-21. Scope: the winter-chill data path only. For the full
per-tool request catalog and timing benchmarks see
`water3d-api-integration-and-performance.md`; for every external service see
`frontend/src/config/apiRegistry.ts`._

## What changed

The **Chill view** now sources its data from the Climate Toolbox **precomputed
chill products** instead of computing the Dynamic Model on-device:

- **Observed** cumulative Chill Portions come from a precomputed daily file.
- A **P10–P90 normal band + P50 median** (new — the app had no chill band
  before) comes from precomputed Oct1-anchored percentile files.
- The on-device Dynamic Model (`calcs/dynamicModel.ts`, over Open-Meteo hourly
  temps) is retained as an automatic **fallback**.

GDD, ETo, and Precipitation are **unchanged** — they stay client-computed from
the 30-year gridMET pull, because their percentile products are fixed-base /
fixed-anchor and can't represent the app's per-crop Tbase/Tupper/biofix.

## Why observed & the 30-yr bands weren't switched to the doc's products

- **Observed data is already the doc's API.** `api/gridMet.ts` already calls the
  same `get-netcdf-data` endpoint and `agg_met_*` files the doc describes — there
  is nothing to migrate. The only difference is host (`toolbox-webservices` vs the
  doc's `climate-dev`); both serve identical data.
- **The 30-yr bands can't use the doc's precomputed percentile files because
  those files are fixed-parameter and the app's bands are per-crop.**
  - GDD band files exist only for bases 32/40/45/50 °F, with **no upper cap** and
    a **Jan1** anchor. The app uses arbitrary per-crop Tbase/Tupper accumulated
    from each crop's **biofix**, so the file is a different quantity for most
    crops — and GDD's `max(0, …)` clipping is non-linear, so one base can't be
    rescaled into another.
  - ETo/precip band files are **Oct1-anchored cumulative** curves. The app
    re-anchors bands to the crop biofix, and **percentiles can't be re-sliced** to
    a new start (subtracting cumulative percentiles is not statistically valid).
  - **Chill was the exception**: it has no crop parameters (fixed Dynamic-Model
    physiology) and is conventionally Oct1-anchored, so the precomputed product is
    the *same* quantity the app was computing.

## Endpoints

Both products use the same generic netCDF endpoint as gridMET and are reached
through the existing **`/api/gridmet`** proxy → `toolbox-webservices.nkn.uidaho.edu`.
No new proxy or upstream was added.

Endpoint: `GET /api/gridmet/Services/get-netcdf-data/` · JSON · no auth.

### 1. Observed chill (daily, Dynamic Model)

`data-path=PATH_TO_TESTING/CHILL/chill_portion_<springYear>.nc` · `variable=chill_portion`

- `<springYear>` = the calendar year the dormant season **ends** in (Oct–Dec →
  next year; Jan–Sep → current year).
- Returns `yyyy-mm-dd` + `chill_portion()` — **daily** increments, Oct 1 → ~Apr 30.
- The client cumulatively sums these.
- ⚠️ Year-versioned and served from a **testing** path; if it 404s (e.g. an
  in-progress season not yet published) the view falls back to the on-device model.

### 2. Normal band (cumulative percentiles)

`data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillportion_Oct1_dailyPercentiles_<p>.nc`
for `<p>` ∈ `p10, p50, p90` (all three in one request) · `variable=<p>`

- Returns `yyyy-mm-dd` (placeholder year `1900…`) + `p10() / p50() / p90()` —
  **already cumulative**, Oct1-anchored, **1979–2022** baseline (~212 days).
- Keyed by **day-of-season**, not calendar date → aligned to the observed series
  **by index-from-Oct-1**, not by MM-DD.

## Data flow

```
useChillClimatology (api/queries/chillClimatology.ts)
  └─ fetchChillToolbox (api/chillClimate.ts)      → observed daily + p10/p50/p90 band
        └─ buildChillClimatology (calcs/chillClimatology.ts)
              → per-day: {date, dailyPortions, cumulativePortions, bandP10/P50/P90}
  (persisted via TanStack Query; TTL.chillClimatology = 12 h)

Dashboard.tsx (Chill view)
  ├─ precomputed present  → observed line + P10–P90 band + P50 median
  └─ precomputed missing  → useChillSeries fallback (client Dynamic Model), no band
```

New/changed modules:

| File | Role |
|---|---|
| `config/chillToolbox.ts` | Product paths, Oct-1 anchor, `1979–2022` baseline, season-year logic |
| `api/chillClimate.ts` | Fetch + parse observed and band (tolerates per-product failure) |
| `calcs/chillClimatology.ts` | Reduce daily→cumulative + index-align band (has unit test) |
| `api/queries/chillClimatology.ts` | `useChillClimatology` query hook |
| `api/gridMet.ts` | Exported `findSeriesTables` for reuse |
| `api/queries/{keys,ttl,index}.ts` | Query key, TTL, barrel export |
| `components/Dashboard.tsx` | Rewired chill data, added band, updated legend/tooltip/card/subtitle |
| `config/apiRegistry.ts` | New `chill-toolbox` registry entry |

## Key behaviors & decisions

- **Anchored to Oct 1** (was Nov 1). The only band available is Oct1-anchored and
  cumulative percentiles can't be validly re-anchored, so observed + band must
  share Oct 1. October chill ≈ 0 at Central-Valley latitudes, so totals barely
  change. Revert via `chillToolboxConfig.seasonStartMonthDay` — but then the band
  can't be shown.
- **Band shown only when precomputed observed is present**, so the line and band
  always share the anchor. On fallback, the observed line still renders (client
  model, Nov 1) with no band.
- **Portions only.** Chill-hours files exist with identical structure but the app
  only surfaces the Dynamic Model (portions); no hours mode is wired.
- **Not changed:** `calcs/analytics.ts` has a separate `AnalyticsSnapshot.chillPortions`
  computed from season weather — independent of the Chill view, left as-is.

## Current external-API map (context)

| Service | Proxy | Role |
|---|---|---|
| gridMET | `/api/gridmet` | Observed daily history + 30-yr GDD/ETo/precip climatology |
| **Climate Toolbox precomputed chill** | `/api/gridmet` | **Observed chill portions + 1979–2022 normal band (new)** |
| Climate Toolbox CFS | `/api/climate-toolbox` | 28-day forecast extension |
| Open-Meteo | `/api/open-meteo` | Hourly temps for the client-model chill fallback |
| OpenET | `/api/openet` | Satellite actual crop ET (opt-in) |
| NRCS Soil Data Access | `/api/soil-data-access` | Field-setup soil lookup |
| Mapbox | direct | Field-picker map / geocoding |
| PocketBase | `/pb` | Auth + field storage + OpenET cache |

## Verification (2026-07-21)

`tsc -b` clean · `vite build` clean · 78 unit tests pass · the exact
`URLSearchParams`-encoded request URLs the provider builds return HTTP 200 on the
live service and parse correctly.
