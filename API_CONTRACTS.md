# Water 3D API Contracts

## Current Frontend Data Audit
The frontend now calls Mapbox Search, Mapbox maps/static thumbnails, OpenET through a Vite dev proxy, and NRCS Soil Data Access through a Vite dev proxy. The dashboard still depends on several mock or local values because those provider contracts are not implemented yet.

### Live Or Partially Live
- Mapbox Search: used in field setup for address/place/lat-lon search.
- Mapbox GL: used in field setup map.
- Mapbox Static Images: used in Manage Fields thumbnails.
- NRCS Soil Data Access: used in field setup to detect map unit, dominant component, surface texture, hydrologic group, drainage class, and AWHC.
- OpenET raster point time series: configured and called for `ET`, `ETo`, and `PR`; values are merged by date when returned.

### Still Mocked Or Static
- Daily weather is mocked in `frontend/src/data/weather.ts`.
- Forecast weather is mocked in `frontend/src/data/weather.ts`.
- Applied water is mocked as `mockAppliedWaterMm`.
- Historical ET comparison is calculated as a local `ETo * 0.9` placeholder.
- Field storage is localStorage; PocketBase repository is scaffolded but not active.
- Default field comes from `frontend/src/data/fields.ts`.
- Weather grid/cell is placeholder text such as `Grid ID #4829` or `Pending weather grid lookup`.
- Elevation is static/defaulted; NRCS soil lookup currently returns `0 ft` because elevation is not a soil property.
- Dashboard subtitle still includes a static `Block A-12`.
- VPD/stress uses local humidity mock values; there is no live humidity/dewpoint provider.
- Chill and frost/heat signals use daily interpolated/mock weather; no hourly temperature provider exists.

## Active v1 Data Needs
The current product direction is setup plus analytics. APIs should support dropping a field pin, selecting a crop, switching fields, detecting soil, and generating ET/GDD/chill/stress analytics. Scheduler, budgeting, scouting, groundwater, and station-management data remain deferred.

## Setup APIs
### Location Search
Provider: Mapbox Search.

Required response fields:
- `id`
- `label`
- `placeName`
- `lat`, `lon`
- optional `county`, `region`, `timezone`
- provider metadata

### Field Context
This is a composed setup response built from multiple providers.

Required response fields:
- `lat`, `lon`
- `label`
- `county`, `region`, `timezone` when available
- `soilTexture`
- `awhcMmPerM`
- `soilMapUnitKey`
- `soilMapUnitName`
- `soilComponentName`
- `soilComponentPercent`
- `hydrologicGroup`
- `drainageClass`
- `weatherCellId`
- `weatherProvider`
- `elevationFt`

Current status:
- Soil fields are live through NRCS SDA.
- Weather cell/provider is missing.
- Elevation is missing.
- County/timezone are not persisted yet.

## Weather APIs
The calculation core needs daily records for the selected field/date range. OpenET does not provide the full weather contract, so this requires a separate climate/weather API.

Required daily fields:
- `date` as ISO date
- `tminC`
- `tmaxC`
- `precipMm`
- `etoMm`
- `source`: `historical` or `forecast`

Required forecast fields:
- same shape as daily weather records
- forecast horizon should cover at least 7 days for near-term irrigation/stress projections

Optional but important:
- `rhMin`, `rhMax` or `tdewC` for VPD
- `hourlyTempsC[24]` for chill, frost, and heat stress accuracy
- weather grid/station/cell id
- provider metadata and quality flags

Current frontend gap:
- GDD, VPD, chill, and stress are still driven by mock/interpolated weather.

## OpenET APIs
OpenET should provide observed ET inputs and optional vegetation/quality signals.

Current configured variables:
- `ET`: actual ET, mapped to `etActualMm`
- `ETo`: reference ET, mapped to `etoMm` and `etReferenceMm`
- `PR`: precipitation, mapped to `precipMm`
- optional `ETof`: ET fraction
- optional `NDVI`: vegetation index
- optional `MODEL_COUNT`: ensemble quality context

Preferred request mode:
- raster point time series using the saved field latitude/longitude

Current frontend gap:
- OpenET data is merged into mock weather dates. A real weather provider should own the canonical date range.
- Historical baseline is still a placeholder.
- ET represents the saved field point, not a full field boundary average.

## Applied Water APIs
The dashboard currently uses `mockAppliedWaterMm`; this should be replaced before irrigation/depletion outputs are trusted.

Required fields:
- `fieldId`
- `date`
- `appliedMm`
- `source`: `user`, `meter`, `irrigation-system`, or `local`

Possible sources:
- manual user input
- irrigation controller export/API
- flow meter or pump telemetry
- local placeholder only for demo

Current frontend gap:
- No user input or provider exists for applied water.

## Historical Baseline APIs
The ET chart displays a historical comparison band/line, but it is currently a simple local transform.

Required fields:
- `date`
- optional `etoMm`
- optional `etcMm`
- optional `gdd`
- provider metadata

Useful baseline options:
- same field/location, same calendar day over prior years
- crop-specific normal for region/county
- OpenET historical ET climatology

Current frontend gap:
- No real historical baseline provider exists.

## Field / Storage APIs
Field data is stored locally now, later through PocketBase.

Required field fields:
- field id/name
- crop id/label
- lat/lon
- soil texture
- AWHC
- soil map unit/component metadata
- hydrologic group/drainage class
- weather cell/provider
- elevation
- stage start date
- root depth/MAD defaults copied from selected crop profile

Current frontend gap:
- localStorage only
- PocketBase auth/storage is scaffolded but disabled
- field storage remains point-based: no boundary capture is planned

## Local Static Crop Data
Crop profiles are local static data for v1:
- GDD base/upper temperatures
- Kc curve
- stage thresholds
- chill requirement where crop-dependent
- stress thresholds
- root depth, MAD, and TAW defaults

Potential future backend need:
- versioned crop profiles if agronomic coefficients need admin editing or regional variants.

## Deferred Data
Do not require these for the current UI:
- water allocation
- district pricing
- profitability/accounting data
- scouting or ground-truth observations
- groundwater monitoring
- manually managed station networks

If added later, allocation/cost fields should be optional user inputs and panels should render only when values exist.
