# Water 3D Data Status

This document tracks which data paths are live, which are mocked or fallback-only, and what still needs to be added before the dashboard should be treated as production decision support.

## Working Now

| Area | Status | Notes |
| --- | --- | --- |
| Field search and setup map | Live | Mapbox Search and Mapbox GL are used during field setup. |
| Field thumbnails | Live | Mapbox Static Images render saved field thumbnails. |
| Soil lookup | Live with fallback | NRCS Soil Data Access detects map unit, component, texture, hydrologic group, drainage class, and AWHC when enabled. Local defaults remain as fallback. |
| OpenET historical ET/ETo | Live with fallback | OpenET raster point time series is requested for saved field coordinates. Responses are cached in PocketBase `openet_cache` when PocketBase is enabled. |
| OpenET response storage | Live | `openet_cache` stores request payload, raw response, field coordinate, variable, date range, and fetched timestamp. |
| Climate Toolbox forecast PET | Live, not cached | 28-day CFS PET forecast is fetched through `/api/climate-toolbox`, parsed from cumulative ensemble/median response tables, and displayed as forecast bars. |
| Climate Toolbox forecast weather | Live, not cached | 28-day CFS `tmmx`, `tmmn`, `pr`, and `sph` are fetched through `/api/climate-toolbox`. Temperature is converted from K to C, precipitation is converted from cumulative to daily increments, specific humidity is converted to approximate RH/dewpoint, and hourly temperatures are interpolated from daily Tmin/Tmax. |
| Forecast PET percentiles | Working | The chart now carries Climate Toolbox forecast PET p10/p90 bounds when the response includes `pet_10p(mm)` and `pet_90p(mm)`. These are forecast uncertainty bounds, not historical climatology bands. |
| ET graph | Working | Bar chart shows historical Actual ET, historical Reference ETo, forecast PET, and forecast PET p10/p90 bound lines. If live historical ET is unavailable, mock past-30-day ET is displayed with a clear warning. No mock forecast is generated. |
| Crop selection | Working | Field setup supports crop selection and saves it with the field. |
| Planting / stage start date | Working | Field setup accepts a date. Live historical ET requests and GDD calculations start from that date; if no date is supplied, Jan 1 of the current year is used. |
| User-adjustable crop stage thresholds | Working | Field setup exposes editable GDD thresholds for the selected crop. The values are stored with the field locally and in PocketBase field `metadata.stageThresholds`, then used by analytics. |
| Irrigation depletion / days-until-irrigation | Forecast estimate | Dashboard estimates days until management allowed depletion is reached using forecast ETc and precipitation with no irrigation applied. Applied-water input is still required before this becomes an irrigation recommendation. |
| Field persistence | Working with conditions | Fields persist to localStorage always. PocketBase field storage works when PocketBase is enabled and the user is authenticated. |

## Mocked Or Fallback Data

| Area | Current behavior | Needed replacement |
| --- | --- | --- |
| Historical ET fallback | Uses `frontend/src/data/weather.ts` to create past-30-day mock ET only when live historical ET is unavailable. | Keep as demo fallback; do not use for advisory decisions. |
| Historical GDD, chill, VPD, heat/frost stress | Historical weather is not wired. Forecast weather records can now drive projected GDD/VPD and approximate dewpoint/hourly temperatures, but current-season historical weather is still absent. | Historical daily Tmin/Tmax, precipitation, humidity/dewpoint, and ideally provider-supplied hourly temperatures from Climate Toolbox/gridMET/CIMIS or another provider. |
| Applied water | No live applied-water source. | User entry, irrigation controller export/API, meter telemetry, or pump telemetry. |
| Weather cell / station id | Placeholder field value. | Provider-specific grid/station lookup. |
| Elevation | Static/defaulted. | Elevation/terrain provider if elevation is needed in calculations. |
| Export data button | UI only. | CSV/JSON export implementation. |

## Not Yet Added

| Feature | Status |
| --- | --- |
| Historical Climate Toolbox/gridMET weather | Blocked by provider configuration. The documented `get-netcdf-data` examples use placeholder data paths; direct gridMET aggregate paths currently return the service error that paths must be whitelisted. |
| Provider-supplied hourly weather or dewpoint | Partially implemented. Daily forecast specific humidity is converted to approximate dewpoint and hourly temperatures are interpolated from daily Tmin/Tmax. Exact chill/frost/heat workflows still need real hourly temperatures or observed dewpoint. |
| Historical percentile bands | Not implemented. Forecast PET p10/p90 bounds are shown, but historical p10/p30/p50/p70/p90 climatology paths still need whitelisted Climate Toolbox dataset keys. |
| Historical ET climatology / baseline | Not implemented. No prior-year or normal-year baseline provider exists yet because the historical percentile/climatology data paths are not configured. |
| Irrigation recommendations with applied water | Partially implemented. A no-irrigation forecast depletion estimate is visible; applied-water records are still required before recommending irrigation timing. |
| Repository access for Emery | External process, not code. |
| Periodic screenshots to Emery | External process unless a reporting workflow is defined. |

## Crop Profiles

Local crop profiles currently exist for:

- Almond
- Processing tomato
- Wine grape
- Pistachio
- Cotton
- Alfalfa

The profiles include base/upper temperatures, Kc curve, GDD stage thresholds, MAD, root depth, TAW, chill requirement where relevant, and stress thresholds. These are v1 defaults and should be reviewed before advisory use.

Reference notes used while filling gaps:

- UC IPM cotton planting guidance says cotton seed requires about 50 degree-days for emergence under good planting-depth conditions.
- UC IPM pistachio shell-hardening model lists shell hardening at 665 C degree-days from 75% bloom.
- UC ANR almond hull-split material documents GDD-based hull-split prediction from bloom.
- Existing tomato, grape, almond, and alfalfa values remain local Water 3D v1 defaults pending agronomic review.

## Current Dashboard Data Rules

- Historical ET comes from OpenET when available.
- OpenET responses are cached in PocketBase.
- Forecast PET, Tmin, Tmax, precipitation, and specific humidity come from Climate Toolbox and are not cached.
- Forecast PET p10/p90 are shown when the Climate Toolbox response includes percentile columns.
- Forecast daily specific humidity is converted to approximate RH/dewpoint; hourly temperatures are interpolated from daily Tmin/Tmax.
- If OpenET historical ET is unavailable, mock past-30-day ET is displayed and labeled as mock.
- If Climate Toolbox forecast weather is unavailable, no forecast PET/weather is displayed.
- GDD/VPD can now use forecast weather records. Historical GDD/VPD remain blocked until historical weather is wired.
- Stage thresholds are editable per field and override crop profile defaults for analytics.
- Irrigation depletion assumes no applied water until applied-water records are integrated.
- The `Precision Insights` panel has been removed from the dashboard.

## Next Implementation Targets

1. Get whitelisted Climate Toolbox `get-netcdf-data` keys/data paths for historical gridMET weather, historical percentiles, and climatology baselines.
2. Add applied-water input or telemetry so depletion can include irrigation and become actionable.
3. Replace interpolated hourly temperatures with provider-supplied hourly data or a confirmed dewpoint endpoint.
4. Add CSV/JSON export for the ET/weather/irrigation data now visible in the dashboard.


# Water 3D Architecture Plan

## Summary
Water 3D is an analytics-first decision support app for Central Valley growers and irrigation managers. The map is used during setup to locate a field, then the core product becomes a crop-aware analytics dashboard driven by ET, GDD, chill, historical comparisons, and stress signals.

The current implementation should start as a self-contained frontend with mock weather/OpenET data and a framework-agnostic TypeScript calculation core. PocketBase remains available for future persistence, but v1 stores field configuration locally and avoids backend coupling until API contracts are finalized.

## Key Implementation Choices
- Build a `frontend/` React + Vite + TypeScript app.
- Keep agronomic math in pure TypeScript modules under `src/calcs`.
- Keep API/provider contracts in `src/api` so live OpenET, Catherine/Climate, Mapbox, and later PocketBase implementations can replace mocks without changing UI calculations.
- Use static crop profiles and deterministic mock weather records for v1.
- Persist selected/configured fields in localStorage.
- Scaffold PocketBase behind `VITE_POCKETBASE_ENABLED=false`; do not make auth or storage calls until explicitly enabled.
- Keep the map out of the primary workflow after setup.
- Remove v1 irrigation scheduling, budgeting, profitability, scouting, groundwater, and station-management surfaces.
- Prioritize the “new direction” Stitch samples:
  - `field_setup_analytics_configuration`
  - `field_analytics_dashboard_new_direction`

## Product Surface
- Field setup:
  - search/drop-pin style location panel
  - detected soil/weather properties
  - crop selection
  - field name entry
  - activation into local field list
- Analytics dashboard:
  - field selector
  - ET accumulation
  - cumulative GDD
  - crop-aware chill card
  - VPD/weather stress status
  - ET forecast and historical comparison chart
  - precision insights generated from calculated state
- No separate map, scheduler, budget, reports, scouting, or groundwater screens in v1.

## Interfaces
- `FieldConfig`: field identity, crop, location, soil, stage dates, and optional irrigation settings.
- `WeatherRecord`: daily weather/ET inputs, with optional RH/dewpoint/hourly temperatures.
- `CropProfile`: crop defaults for GDD, Kc, MAD, root depth, chill, and stress thresholds.
- `AnalyticsSnapshot`: computed dashboard state from field + weather + crop profile.
- `DataProvider`: later boundary for live OpenET/weather providers.
- `LocationProvider`, `WeatherProvider`, and `EtProvider`: active v1 API boundaries for setup and analytics.
- `AuthRepository`: PocketBase login/session/logout boundary, disabled by default.
- `FieldRepository`: future PocketBase field storage boundary; current app remains localStorage-backed.

## Test Plan
- Unit-test GDD, ETc, VPD, chill gating, and analytics snapshot generation.
- Verify crop-aware dashboard behavior, especially chill visibility.
- Verify localStorage field setup/save/load behavior manually in the app.
- Run TypeScript build before delivery.

## Assumptions
- v1 does not include irrigation scheduling, budgeting, profitability, groundwater integrations, scouting, reports, or station management.
- Live OpenET/Catherine API credentials are not available in the current workspace, so the app uses mock provider data behind replaceable interfaces.
- PocketBase has no domain collections yet, so localStorage is the implementation default.
- PocketBase auth/storage code is present only as a disabled adapter. No records should be created until backend schema and enablement are approved.
