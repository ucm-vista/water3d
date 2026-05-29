# Water 3D API Contracts

## Active v1 Data Needs
The current product direction is setup plus analytics. APIs should support dropping a field pin, selecting a crop, switching fields, and generating ET/GDD/chill/stress analytics. Scheduler, budgeting, scouting, groundwater, and station-management data are intentionally deferred.

## Setup APIs
- Geocoding/search: search text to lat/lon candidates for the setup map.
- Reverse location context: lat/lon to approximate place label, county, and timezone if available.
- Soil lookup: lat/lon to soil texture and available water-holding capacity.
- Weather grid lookup: lat/lon to provider grid/station/cell id for diagnostics only.

Required setup response fields:
- `lat`, `lon`
- `label`
- `soilTexture`
- `awhcMmPerM`
- `weatherCellId`
- `elevationFt`

## Weather / ET Analytics APIs
Required daily records:
- `date` as ISO date
- `tminC`
- `tmaxC`
- `precipMm`
- `etoMm`
- `source`: `historical` or `forecast`

Optional but valuable:
- `rhMin`, `rhMax` or `tdewC` for VPD
- `hourlyTempsC[24]` for better chill, frost, and heat calculations
- provider metadata: provider name, generated timestamp, quality flags

OpenET-style data should provide:
- historical ET or reference ET by date and field coordinate
- provider/source metadata
- historical comparison baseline where available

Catherine/Climate API-style data should provide:
- daily Tmin/Tmax/ETo/precip
- forecast records
- humidity/dewpoint if available
- hourly temperatures if available

## Crop / Field Data
Field data stored locally now, later through PocketBase:
- field id/name
- crop id/label
- lat/lon
- soil texture
- AWHC
- stage start date
- root depth/MAD defaults copied from selected crop profile

Crop profiles are local static data for v1:
- GDD base/upper temperatures
- Kc curve
- stage thresholds
- chill requirement where crop-dependent
- stress thresholds

## Deferred Data
Do not require these for the current UI:
- irrigation event logs
- applied water logs
- water allocation
- district pricing
- profitability/accounting data
- scouting or ground-truth observations
- groundwater monitoring
- manually managed station networks

If added later, allocation/cost fields should be optional user inputs and panels should render only when values exist.
