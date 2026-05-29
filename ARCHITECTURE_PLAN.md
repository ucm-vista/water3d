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
