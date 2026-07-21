# Water3D API integration and performance guide

Tested **2026-07-20** at **37.0° N, 120.5° W** near Merced, California.

This is the practical API plan for the four Water3D tools:

- Growing Degree Days (GDD)
- Chill Hours / Chill Portions
- Reference ETo / Crop ET
- Precipitation (PPT)

Every timing is based on three sequential HTTPS requests from the same test environment. Each request opened a new connection, so DNS, TCP, and TLS setup are included. All benchmark requests returned HTTP 200. These are measurements, not an availability or latency guarantee.

## Quick implementation map

| Tool | Calls needed when opened | First useful chart, median | Complete chart, median | Measured complete range |
|---|---|---:|---:|---:|
| GDD | Observed TMIN/TMAX + historical bands + CFS TMIN/TMAX + optional NMME TMIN/TMAX | 1.58 s without NMME; 1.88 s with NMME | 7.12 s | 7.01–7.30 s |
| Chill Hours | Observed chill hours + historical bands | 0.71 s | 0.71 s | 0.70–1.27 s |
| Chill Portions | Observed chill portions + historical bands | 0.61 s | 0.61 s | 0.57–1.18 s |
| ETo / Crop ET | Observed ETo + historical bands + CFS ETo + optional NMME ETo | 1.10 s | 6.84 s | 6.83–6.95 s |
| PPT | Observed PPT + historical bands + CFS PPT + optional NMME PPT | 1.62 s | 6.86 s | 6.79–7.14 s |

These estimates assume all calls for the active tool are started concurrently and each layer is rendered as soon as it arrives. They exclude chart-rendering time, which should be small compared with these network times.

The slow request is the observed GridMET series. Historical and forecast layers normally arrive first. Water3D should show them immediately and add the observed line when it finishes.

## Common service rules

### Legacy JSON service

```text
https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/
```

- Method: `GET`
- Authentication/API key: none
- Response: JSON
- Required custom headers: none
- Cross-origin access: restricted; a Water3D browser origin was not allowed during testing
- Deployment: call through a Water3D server-side proxy or obtain a CORS allow-list change
- `calc_method=all` and `calc_method=stats`: ignored by this endpoint

Successful responses generally look like:

```json
{
  "data": [{
    "metadata": ["#Variables:", "..."],
    "lat_lon": ["36.9833", "-120.5167"],
    "yyyy-mm-dd": ["2026-01-01", "..."],
    "<variable>(<unit>)": ["1.23", "..."]
  }]
}
```

Dates and values are returned as JSON strings. The observed GridMET `end-date` behaved as an exclusive upper bound in testing.

### Public 1991–2020 THREDDS service

```text
https://tds-proxy.nkn.uidaho.edu/thredds/dodsC/
```

- Method: `GET`
- Authentication/API key: none
- Response: OPeNDAP text when `.ascii` is requested
- CORS: `Access-Control-Allow-Origin: *`
- Purpose: 1991–2020 daily historical **mean** for PPT, ETo, and fixed-base GDD
- Limitation: no matching 1991–2020 p10/p30/p50/p70/p90 arrays and no chill files

Do not combine a 1991–2020 mean line with the legacy percentile bands. The legacy percentile NetCDF metadata identifies a different baseline: 1981–2010 for PPT/ETo/GDD and 1979–2022 for chill.

## 1. Growing Degree Days (default Water3D tool)

### Calls required

1. Observed GridMET TMIN and TMAX
2. Historical GDD percentile bands
3. CFSv2 28-day TMIN and TMAX
4. Optional NMME seven-month TMIN and TMAX
5. Optional 1991–2020 historical mean instead of the older percentile product

Start calls 1–4 concurrently. The historical and forecast layers should render in approximately 1.6–1.9 seconds under median conditions; the observed line should complete in approximately 7.1 seconds.

### GDD observed TMIN/TMAX

**Expected time:** median **7.12 s**, measured range **7.01–7.30 s**, payload **7.2 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_DODS/agg_met_tmmn_1979_CurrentYear_CONUS.nc&variable=daily_minimum_temperature&variable-name=daily_minimum_temperature&data-path=PATH_TO_DODS/agg_met_tmmx_1979_CurrentYear_CONUS.nc&variable=daily_maximum_temperature&variable-name=daily_maximum_temperature&start-date=2026-01-01&end-date=2026-07-19'
```

Expected response fields:

```text
yyyy-mm-dd
daily_minimum_temperature(K)
daily_maximum_temperature(K)
```

The legacy UI calculates:

```text
daily GDD = max(((TMIN + TMAX) / 2) - base, 0)
```

It supports lower bases 32, 40, 45, and 50°F. It does not implement an upper threshold.

### GDD historical p10/p30/p50/p70/p90

**Expected time:** median **1.58 s**, measured range **1.56–3.00 s**, payload **24.3 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_GRIDMET_PERCENTILES/gridmet_gdd50_Jan1_dailyPercentiles_p10.nc&variable=p10&variable-name=p10&data-path=PATH_TO_GRIDMET_PERCENTILES/gridmet_gdd50_Jan1_dailyPercentiles_p90.nc&variable=p90&variable-name=p90&data-path=PATH_TO_GRIDMET_PERCENTILES/gridmet_gdd50_Jan1_dailyPercentiles_p50.nc&variable=p50&variable-name=p50&data-path=PATH_TO_GRIDMET_PERCENTILES/gridmet_gdd50_Jan1_dailyPercentiles_p30.nc&variable=p30&variable-name=p30&data-path=PATH_TO_GRIDMET_PERCENTILES/gridmet_gdd50_Jan1_dailyPercentiles_p70.nc&variable=p70&variable-name=p70'
```

Replace every `gdd50` with `gdd32`, `gdd40`, or `gdd45` for another fixed base.

Expected fields:

```text
yyyy-mm-dd
p10(F)
p90(F)
p50(F)
p30(F)
p70(F)
```

Use `p50` as the median line, p30–p70 as the inner band, and p10–p90 as the outer band. File metadata says the baseline is 1981–2010.

### GDD CFSv2 short forecast

**Expected time:** median **0.47 s**, measured range **0.46–0.84 s**, payload **1.4 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_CFS/cfsv2_metdata_forecast_tmmn_daily.nc&variable=air_temperature&variable-name=tmmn&data-path=PATH_TO_CFS/cfsv2_metdata_forecast_tmmx_daily.nc&variable=air_temperature&variable-name=tmmx'
```

Expected fields:

```text
yyyy-mm-dd
tmmn(K)
tmmx(K)
```

The captured response had 28 daily dates. Calculate GDD from forecast TMIN/TMAX with the same method used for observed data.

### GDD NMME seven-month forecast

**Expected time:** median **1.88 s**, measured range **1.52–4.29 s**, payload **26.9 KiB**.

This copy-pasteable example constructs the long repeated-parameter request:

```bash
base='https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True'
url="$base"
for model in ENSMEAN NASA-GEOS5v2 NCAR CFSv2 GEM5.2_NEMO CanESM5; do
  url+="&data-path=PATH_TO_NMME_DAILY_DATA/bcsd_nmme_metdata_${model}_forecast_tasmin_daily.nc&variable=tasmin&variable-name=tmmn_${model}"
  url+="&data-path=PATH_TO_NMME_DAILY_DATA/bcsd_nmme_metdata_${model}_forecast_tasmax_daily.nc&variable=tasmax&variable-name=tmmx_${model}"
done
curl --fail --silent --show-error "$url"
```

Expected fields include:

```text
yyyy-mm-dd
tmmn_ENSMEAN(F), tmmx_ENSMEAN(F)
tmmn_NASA-GEOS5v2(F), tmmx_NASA-GEOS5v2(F)
tmmn_NCAR(F), tmmx_NCAR(F)
tmmn_CFSv2(F), tmmx_CFSv2(F)
tmmn_GEM5.2_NEMO(F), tmmx_GEM5.2_NEMO(F)
tmmn_CanESM5(F), tmmx_CanESM5(F)
```

Calculate GDD for each model separately before calculating the model spread. Do not calculate a spread from only the ensemble-mean temperatures.

### Optional GDD 1991–2020 mean

**Expected time:** median **0.60 s**, measured range **0.60–0.60 s**, payload **11.5 KiB**.

```bash
curl --globoff --fail --silent --show-error \
  'https://tds-proxy.nkn.uidaho.edu/thredds/dodsC/MET/climatologies/dailyClimatologies_1991_2020/gridmet_gdd50_dailyClimatologies.nc.ascii?gdd50[0:1:364][298][102],time[0:1:364],lat[298],lon[102]'
```

Change both `gdd50` occurrences to `gdd32`, `gdd40`, or `gdd45` as needed. This returns a daily mean contribution, not a cumulative series or percentile band. Slice to the selected start date and cumulatively sum in Water3D.

### GDD page-load estimate

| Milestone | Median estimate | Slower observed test |
|---|---:|---:|
| Historical + 28-day CFS ready | 1.58 s | 3.00 s |
| Historical + CFS + seven-month NMME ready | 1.88 s | 4.29 s |
| Complete chart including observed season | 7.12 s | 7.30 s |

Because GDD is the default tool, Water3D should not preload PPT, ETo, or chill. Start the four GDD calls concurrently, render each layer progressively, and cache the observed result through the Water3D proxy.

## 2. Chill Hours and Chill Portions

### Calls required

For Chill Hours:

1. Observed precomputed chill hours
2. Historical chill-hour percentile bands

For Chill Portions:

1. Observed precomputed chill portions
2. Historical chill-portion percentile bands

No CFSv2 or NMME request fired in the captured chill views. Fetch the observed and historical request concurrently when the user opens or changes the chill model.

### Observed chill hours

**Expected time:** median **0.64 s**, measured range **0.63–0.68 s**, payload **5.0 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_TESTING/CHILL/chill_hours_2026.nc&variable=chill_hours&variable-name=chill_hours&start-date=2025-10-01&end-date=2026-07-19'
```

Expected fields:

```text
yyyy-mm-dd
chill_hours(hours)
```

The daily values are precomputed using the fixed 32–45°F chill-hour window. Cumulatively sum them in Water3D.

### Chill-hour historical bands

**Expected time:** median **0.71 s**, measured range **0.70–1.27 s**, payload **13.8 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillhours_Oct1_dailyPercentiles_p10.nc&variable=p10&variable-name=p10&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillhours_Oct1_dailyPercentiles_p90.nc&variable=p90&variable-name=p90&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillhours_Oct1_dailyPercentiles_p50.nc&variable=p50&variable-name=p50&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillhours_Oct1_dailyPercentiles_p30.nc&variable=p30&variable-name=p30&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillhours_Oct1_dailyPercentiles_p70.nc&variable=p70&variable-name=p70'
```

Expected fields are `p10(hours)`, `p90(hours)`, `p50(hours)`, `p30(hours)`, and `p70(hours)`. File metadata says the baseline is 1979–2022.

### Observed chill portions

**Expected time:** median **0.61 s**, measured range **0.54–0.64 s**, payload **5.0 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_TESTING/CHILL/chill_portion_2026.nc&variable=chill_portion&variable-name=chill_portion&start-date=2025-10-01&end-date=2026-07-19'
```

Expected fields:

```text
yyyy-mm-dd
chill_portion(portions)
```

These values use the Dynamic Model and should not be labeled or interpreted as chill hours.

### Chill-portion historical bands

**Expected time:** median **0.59 s**, measured range **0.57–1.18 s**, payload **12.7 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillportion_Oct1_dailyPercentiles_p10.nc&variable=p10&variable-name=p10&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillportion_Oct1_dailyPercentiles_p90.nc&variable=p90&variable-name=p90&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillportion_Oct1_dailyPercentiles_p50.nc&variable=p50&variable-name=p50&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillportion_Oct1_dailyPercentiles_p30.nc&variable=p30&variable-name=p30&data-path=PATH_TO_GRIDMET_PERCENTILES_19792022/gridmet_chillportion_Oct1_dailyPercentiles_p70.nc&variable=p70&variable-name=p70'
```

Expected fields are `p10(portions)`, `p90(portions)`, `p50(portions)`, `p30(portions)`, and `p70(portions)`.

### Chill page-load estimate

| View | Median complete chart | Slower observed test |
|---|---:|---:|
| Chill Hours | 0.71 s | 1.27 s |
| Chill Portions | 0.61 s | 1.18 s |

The meeting disclosed a possible one-to-two-day mismatch at the beginning of the chill season between historical reconstruction and real-time accumulation. Show that caveat until the Climate Toolbox team confirms corrected files.

Custom chill-hour temperature windows cannot use these precomputed values or percentile bands. A custom window requires reconstructing hourly temperatures from daily TMIN/TMAX—or obtaining true hourly data—and recalculating every baseline year consistently.

## 3. Reference ETo and Crop ET

### Calls required

1. Observed GridMET reference ETo
2. Historical ETo percentile bands
3. CFSv2 28-day ETo and forecast bands
4. Optional NMME seven-month ETo
5. Optional 1991–2020 historical mean instead of the older percentile product

Start calls 1–4 concurrently. Historical and forecast layers should normally render in approximately 1.1 seconds; the observed series should complete in approximately 6.8 seconds.

### Observed reference ETo

**Expected time:** median **6.84 s**, measured range **6.83–6.95 s**, payload **6.8 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_DODS/agg_met_pet_1979_CurrentYear_CONUS.nc&variable=daily_mean_reference_evapotranspiration_grass&variable-name=daily_mean_reference_evapotranspiration_grass&start-date=2025-10-01&end-date=2026-07-19'
```

Expected fields:

```text
yyyy-mm-dd
daily_mean_reference_evapotranspiration_grass(mm)
```

Values are millimeters/day. Slice to the selected season and cumulatively sum. Convert to inches only for display when needed.

### ETo historical p10/p30/p50/p70/p90

**Expected time:** median **1.10 s**, measured range **1.04–2.13 s**, payload **23.9 KiB**.

```bash
base='https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True'
url="$base"
for percentile in p10 p90 p50 p30 p70; do
  url+="&data-path=PATH_TO_GRIDMET_PERCENTILES/gridmet_pet_Oct1_dailyPercentiles_${percentile}.nc&variable=${percentile}&variable-name=${percentile}"
done
curl --fail --silent --show-error "$url"
```

Expected fields are `p10(mm)`, `p90(mm)`, `p50(mm)`, `p30(mm)`, and `p70(mm)`. These files describe a cumulative October-anchored ETo climatology. File metadata says the baseline is 1981–2010.

### ETo CFSv2 short forecast

**Expected time:** median **0.63 s**, measured range **0.62–1.35 s**, payload **2.7 KiB**.

```bash
base='https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True'
url="$base&data-path=PATH_TO_CFS/cfsv2_metdata_forecast_pet_daily.nc&variable=potential_evapotranspiration&variable-name=potential_evapotranspiration"
for percentile in p90 p70 p50 p30 p10; do
  url+="&data-path=PATH_TO_CFS//summaries/cfsv2_pet_${percentile}.nc&variable=${percentile}&variable-name=potential_evapotranspiration_${percentile}"
done
curl --fail --silent --show-error "$url"
```

Expected fields:

```text
yyyy-mm-dd
potential_evapotranspiration(mm)
potential_evapotranspiration_p90(mm)
potential_evapotranspiration_p70(mm)
potential_evapotranspiration_p50(mm)
potential_evapotranspiration_p30(mm)
potential_evapotranspiration_p10(mm)
```

### ETo NMME seven-month forecast

**Expected time:** median **1.08 s**, measured range **0.91–2.35 s**, payload **13.7 KiB**.

```bash
base='https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True'
url="$base"
for model in ENSMEAN NASA-GEOS5v2 NCAR CFSv2 GEM5.2_NEMO CanESM5; do
  url+="&data-path=PATH_TO_NMME_DAILY_DATA/bcsd_nmme_metdata_${model}_forecast_pet_daily.nc&variable=pet&variable-name=pet_${model}"
done
curl --fail --silent --show-error "$url"
```

Expected fields include `pet_ENSMEAN`, `pet_NASA-GEOS5v2`, `pet_NCAR`, `pet_CFSv2`, `pet_GEM5.2_NEMO`, and `pet_CanESM5`.

### Optional ETo 1991–2020 mean

**Expected time:** median **0.47 s**, measured range **0.47–0.48 s**, payload **10.5 KiB**.

```bash
curl --globoff --fail --silent --show-error \
  'https://tds-proxy.nkn.uidaho.edu/thredds/dodsC/MET/climatologies/dailyClimatologies_1991_2020/gridmet_pet_dailyClimatologies.nc.ascii?pet[0:1:364][298][102],time[0:1:364],lat[298],lon[102]'
```

This returns 365 daily mean ETo values in millimeters. It does not return percentile bands.

### Crop ET calculation

Crop ET is calculated in Water3D, not returned as another API field:

```text
ETc = Kc × ETo
```

Apply the selected crop coefficient to every daily observed, forecast, and historical value before accumulating. For a stage-varying coefficient, do not multiply an already-cumulative ETo curve; apply each day's coefficient first.

### ETo/Crop ET page-load estimate

| Milestone | Median estimate | Slower observed test |
|---|---:|---:|
| Historical + 28-day CFS ready | 1.10 s | 2.13 s |
| Historical + CFS + seven-month NMME ready | 1.10 s | 2.35 s |
| Complete chart including observed season | 6.84 s | 6.95 s |

---

## 4. Precipitation (PPT) tool

### Calls this tool needs

1. Observed GridMET daily precipitation for the current season.
2. Legacy historical percentile curves: p10, p90, p50, p30, and p70.
3. CFSv2 daily precipitation plus its forecast percentiles.
4. Optional NMME precipitation from six models for the longer forecast.
5. Optional THREDDS 1991–2020 mean if a mean-only baseline is acceptable.

Fire the independent calls concurrently. The historical and forecast responses normally arrive well before the observed-season response.

### Observed GridMET precipitation

**Expected time:** median **6.86 s**, measured range **6.79–7.14 s**, payload **6.7 KiB**.

```bash
curl --fail --silent --show-error \
  'https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True&data-path=PATH_TO_DODS/agg_met_pr_1979_CurrentYear_CONUS.nc&variable=precipitation_amount&variable-name=precipitation_amount&start-date=2025-10-01&end-date=2026-07-19'
```

Expected daily field: `precipitation_amount(mm)`. The file is a GridMET aggregation. The API's `end-date` is effectively exclusive in the tested response, so request the day after the last date that Water3D needs to display.

### Historical PPT percentile bands

**Expected time:** median **1.62 s**, measured range **1.59–3.35 s**, payload **22.9 KiB**.

```bash
base='https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True'
url="$base"
for percentile in p10 p90 p50 p30 p70; do
  url+="&data-path=PATH_TO_GRIDMET_PERCENTILES/gridmet_ppt_Oct1_dailyPercentiles_${percentile}.nc&variable=${percentile}&variable-name=${percentile}"
done
curl --fail --silent --show-error "$url"
```

Expected fields are `p10(mm)`, `p90(mm)`, `p50(mm)`, `p30(mm)`, and `p70(mm)`. The chart mapping is:

- median: p50
- broad spread: p10–p90
- central spread: p30–p70

These are cumulative, October-anchored GridMET curves. File metadata identifies the baseline as 1981–2010. They do not dynamically change to match a requested season start.

### PPT CFSv2 short forecast

**Expected time:** median **0.72 s**, measured range **0.63–2.23 s**, payload **2.6 KiB**.

```bash
base='https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True'
url="$base&data-path=PATH_TO_CFS/cfsv2_metdata_forecast_pr_daily.nc&variable=precipitation_amount&variable-name=precipitation_amount"
for percentile in p90 p70 p50 p30 p10; do
  url+="&data-path=PATH_TO_CFS//summaries/cfsv2_pr_${percentile}.nc&variable=${percentile}&variable-name=precipitation_amount_${percentile}"
done
curl --fail --silent --show-error "$url"
```

Expected fields:

```text
yyyy-mm-dd
precipitation_amount(mm)
precipitation_amount_p90(mm)
precipitation_amount_p70(mm)
precipitation_amount_p50(mm)
precipitation_amount_p30(mm)
precipitation_amount_p10(mm)
```

### PPT NMME seven-month forecast

**Expected time:** median **0.93 s**, measured range **0.90–2.48 s**, payload **13.7 KiB**.

```bash
base='https://climate-dev.nkn.uidaho.edu/Services//get-netcdf-data/?decimal-precision=2&lat=37&lon=-120.5&positive-east-longitude=False&request-JSON=True'
url="$base"
for model in ENSMEAN NASA-GEOS5v2 NCAR CFSv2 GEM5.2_NEMO CanESM5; do
  url+="&data-path=PATH_TO_NMME_DAILY_DATA/bcsd_nmme_metdata_${model}_forecast_pr_daily.nc&variable=pr&variable-name=pr_${model}"
done
curl --fail --silent --show-error "$url"
```

Expected fields include `pr_ENSMEAN`, `pr_NASA-GEOS5v2`, `pr_NCAR`, `pr_CFSv2`, `pr_GEM5.2_NEMO`, and `pr_CanESM5`.

### Optional PPT 1991–2020 mean

**Expected time:** median **0.45 s**, measured range **0.45–0.46 s**, payload **10.5 KiB**.

```bash
curl --globoff --fail --silent --show-error \
  'https://tds-proxy.nkn.uidaho.edu/thredds/dodsC/MET/climatologies/dailyClimatologies_1991_2020/gridmet_ppt_dailyClimatologies.nc.ascii?ppt[0:1:364][298][102],time[0:1:364],lat[298],lon[102]'
```

This returns 365 daily mean precipitation values in millimeters. It does not return percentile bands.

### PPT page-load estimate

| Milestone | Median estimate | Slower observed test |
|---|---:|---:|
| Historical + 28-day CFS ready | 1.62 s | 3.35 s |
| Historical + CFS + seven-month NMME ready | 1.62 s | 3.35 s |
| Complete chart including observed season | 6.86 s | 7.14 s |

---

## Platform loading plan

### Default Water3D page

Because Water3D opens on GDD, the initial page should request only the GDD resources. Do not preload Chill, ETo, or PPT before the user opens those tools.

For the fastest useful first render:

1. Start observed temperatures, the five GDD climatology fields, and CFSv2 together.
2. Render the historical bands and short forecast as soon as they arrive, normally around **1.58 s**.
3. Add NMME only if the long-range forecast is visible by default. That raises the median first-useful milestone to about **1.88 s**.
4. Add the observed GridMET curve when it arrives, normally around **7.12 s**.

The page shell, map, controls, and cached chart frame should render independently of these calls. The user should not see a blank page while GridMET is computing the observed response.

### Requests within each tool

All requests for the active tool are independent and should run concurrently:

```text
active tool
├── observed GridMET season
├── historical percentile bands
├── CFSv2 short forecast
└── NMME long forecast, if enabled
```

The total page-data time is therefore approximately the slowest required request, not the sum of every request. Calling them sequentially would make the pages unnecessarily slow.

### Combined observed request

The legacy API can return several observed variables in one request. A combined request for PPT, ETo, TMIN, and TMAX measured **7.26 s median**, **7.22–7.32 s range**, and **15.1 KiB**.

Use this only after the initial GDD render if Water3D deliberately prefetches ETo and PPT. It is not a good default first call because it downloads variables for inactive tools and was slightly slower than the GDD-only observed request.

### Caching and proxying

- Call the legacy API through a Water3D server endpoint. Direct browser calls from an arbitrary production origin are likely to be blocked by its origin policy, and the server can normalize errors and cache results.
- Cache by resolved GridMET grid cell rather than raw coordinate when possible. Nearby coordinates often map to the same cell.
- Cache historical percentile files for a long time; their baselines are static.
- Cache observed GridMET values through the dataset's next expected update, then refresh only the latest dates.
- Cache CFSv2 and NMME by forecast initialization cycle. Do not refetch unchanged cycles for every visitor.
- Set an upstream timeout and retry transient failures once. Keep the already-rendered climatology visible if observed data is late.
- Reuse HTTP connections from the server. The cold command-line tests opened a new DNS/TCP/TLS connection each time; a warm pooled connection can save roughly **0.2 s** in these measurements.

### Consolidated measured timing table

| Tool and request | Median | Measured range | Payload |
|---|---:|---:|---:|
| GDD observed TMIN/TMAX | 7.12 s | 7.01–7.30 s | 7.2 KiB |
| GDD historical bands | 1.58 s | 1.56–3.00 s | 24.3 KiB |
| GDD CFSv2 | 0.47 s | 0.46–0.84 s | 1.4 KiB |
| GDD NMME | 1.88 s | 1.52–4.29 s | 26.9 KiB |
| GDD 1991–2020 mean | 0.60 s | 0.60–0.60 s | 11.5 KiB |
| Chill Hours observed | 0.64 s | 0.63–0.68 s | 5.0 KiB |
| Chill Hours historical bands | 0.71 s | 0.70–1.27 s | 13.8 KiB |
| Chill Portions observed | 0.61 s | 0.54–0.64 s | 5.0 KiB |
| Chill Portions historical bands | 0.59 s | 0.57–1.18 s | 12.7 KiB |
| ETo observed | 6.84 s | 6.83–6.95 s | 6.8 KiB |
| ETo historical bands | 1.10 s | 1.04–2.13 s | 23.9 KiB |
| ETo CFSv2 | 0.63 s | 0.62–1.35 s | 2.7 KiB |
| ETo NMME | 1.08 s | 0.91–2.35 s | 13.7 KiB |
| ETo 1991–2020 mean | 0.47 s | 0.47–0.48 s | 10.5 KiB |
| PPT observed | 6.86 s | 6.79–7.14 s | 6.7 KiB |
| PPT historical bands | 1.62 s | 1.59–3.35 s | 22.9 KiB |
| PPT CFSv2 | 0.72 s | 0.63–2.23 s | 2.6 KiB |
| PPT NMME | 0.93 s | 0.90–2.48 s | 13.7 KiB |
| PPT 1991–2020 mean | 0.45 s | 0.45–0.46 s | 10.5 KiB |
| Combined observed PPT/ETo/TMIN/TMAX | 7.26 s | 7.22–7.32 s | 15.1 KiB |

These times are planning estimates, not service guarantees.

---

## Important correctness constraints

- **`calc_method` does not select raw versus statistical data.** In testing, `calc_method=all` and `calc_method=stats` were accepted but ignored by the generic endpoint. The files listed in `data-path` determine what is returned.
- **The percentile bands are precomputed files.** The legacy GDD, ETo, and PPT band files report a 1981–2010 baseline. Chill file metadata reports 1979–2022.
- **The newer 1991–2020 service is mean-only.** It cannot supply matching p10/p30/p50/p70/p90 bands. Do not label the legacy bands as 1991–2020, and do not silently combine a 1991–2020 mean with 1981–2010 percentile spreads.
- **GridMET drives observed daily data.** CFSv2 drives the short forecast extension, and the tested response is approximately 28 days. NMME supplies the optional multi-model extension, approximately seven months depending on the initialization date.
- **Chill is precomputed.** The API returns Chill Hours and Chill Portions directly, including their own percentile curves; the UI does not need to reconstruct them from raw TMIN/TMAX. The Chill Hours product uses the fixed 32–45 °F window represented in the source file.
- **Legacy ETo and PPT climatology curves are October-anchored cumulative series.** They do not restart at an arbitrary requested date. Subtracting the cumulative value at a new start date from each percentile curve does not produce a statistically valid percentile distribution for the shortened interval.
- **Dates need explicit handling.** The observed API behaved as if `end-date` were exclusive. Test boundary dates before exposing them in the UI.

---

## Re-run a timing test

Replace `<URL>` with any request in this document:

```bash
curl --globoff --compressed --silent --show-error --output /dev/null \
  --write-out 'HTTP %{http_code}\nDNS %{time_namelookup}s\nConnect %{time_connect}s\nTLS %{time_appconnect}s\nTTFB %{time_starttransfer}s\nTotal %{time_total}s\nBytes %{size_download}\n' \
  '<URL>'
```

Run each request at least three times and use the median. For a realistic Water3D page test, start every request required by one tool at the same time and measure the moment the first usable chart and the complete chart become visible.
