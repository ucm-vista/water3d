# Water 3D

Analytics-first irrigation/crop decision-support app for Central Valley growers. A
map is used during field setup to locate a field; the core product is then a
crop-aware analytics dashboard driven by **GDD, growth stages, chill, ET, and
year-over-year comparisons**.

- **`frontend/`** — React + Vite + TypeScript single-page app. Agronomic math lives
  in pure modules under `src/calcs`; data-provider contracts under `src/api`.
- **`deploy/`** — production **Traefik** stack (edge TLS + routing, nginx SPA)
  on one subdomain under `*.vistacompute1.ucmerced.edu`, auto-HTTPS.

There is no backend: fields and settings live in the browser (`localStorage`).

---

## Quick start (fresh clone)

**Prerequisites:** Node 22 + npm.

```bash
git clone <repo> && cd w3d_v2/frontend
npm install
cp .env.example .env    # optional: tweak data-source toggles (no keys needed)
npm run dev
```

Open the printed URL (default http://localhost:5173).

### Gotchas

- **Env is build-time.** `frontend/.env` is gitignored (only `.env.example` is
  committed) and is read when Vite starts — **restart `npm run dev`** after editing it.

---

## Commands

| | |
| --- | --- |
| `npm run dev` (in `frontend/`) | Vite dev server |
| `npm test` | Vitest unit tests |
| `npm run build` | TypeScript build + production bundle |

---

## Data sources

Weather/ET data is fetched live through the Vite dev proxy (`/api/*`); the
production equivalent is Traefik reverse-proxying the same paths.

| Source | Role | Notes |
| --- | --- | --- |
| **gridMET** (Climate Toolbox) | Primary history | Daily Tmin/Tmax, precip, ETo, RH, VPD back to 1979 via `/api/gridmet`. ~2-day lag; truncated tails are flagged with the actual last-available date. |
| **Climate Toolbox CFS** | Forecast | 28-day PET + weather via `/api/climate-toolbox`, `calc-mode=all`; PET p10/median/p90 computed client-side from 48 ensemble members. |
| **Open-Meteo** | Chill season | Sole source of real hourly temperatures (used for chill-hour accumulation). |
| **Esri World Imagery** | Setup map | Keyless satellite tiles (MapLibre GL) during field setup; static thumbnails via the export endpoint. |
| **OSM Nominatim** | Geocoding | Keyless address/place search on Enter (usage policy forbids autocomplete). |

Client-side caching: gridMET responses also persist to a versioned `localStorage`
cache (`src/api/weatherCache.ts`, 7-day TTL) for fast repaints. TanStack Query
caches the selected field's weather + computations.

---

## Dashboard at a glance

- **Per-metric tools:** `GDD | Chill | ET` selector. Chill shows only for crops
  with chill enabled; ET is always available.
- **Full calendar-year GDD chart** (Jan 1–Dec 31): observed history + forecast,
  dashed year-end projection from the 5-yr average, "today" reference line.
  Default overlays are last year + the 5-yr average.
- **Inline real-time controls** (base/upper temp, target, °F/°C, chill thresholds,
  ET toggles) write straight to live settings — no draft/Apply gate. Less-common
  options live in an **Advanced Graph Settings** modal.
- **Metric cards** answer farmer questions: cumulative GDD with days ahead/behind
  the 5-yr normal, current stage, projected next-stage date, chill hours
  (perennials) or season progress (annuals).
- **Growth Stage Timeline:** actual/forecast/projected dates per stage with the
  most recent comparison year alongside.
- Top bar carries the field selector + **Edit** / **Location** modals; field
  identity lives there rather than in a sidebar.

### Crop profiles

Local v1 defaults exist for **almond, processing tomato, wine grape, pistachio,
cotton, alfalfa** (base/upper temps, Kc curve, GDD stage thresholds, MAD, root
depth, TAW, chill requirement where relevant, stress thresholds). Stage thresholds
are editable per field and override the profile defaults. See
[`CROP_GDD_REFERENCES.md`](CROP_GDD_REFERENCES.md). **Review before advisory use.**

---

## Important caveats

- **Not yet production decision support.** Several paths are demo/fallback.
- **Applied water** has no live source, so the days-until-irrigation depletion
  estimate assumes **no irrigation applied** — it is an estimate, not a
  recommendation, until applied-water input/telemetry is integrated.
- **Historical ET fallback:** if live ET is unavailable, mock past-30-day ET is
  shown and clearly labeled as mock. No mock forecast is ever generated.
- **Hourly temperatures** are interpolated from daily Tmin/Tmax for the forecast
  (specific humidity → approximate RH/dewpoint); exact chill/frost/heat workflows
  still want real hourly data.
- **Historical climatology percentile bands** are not implemented (forecast PET
  p10/p90 bounds are shown, but those are forecast uncertainty, not climatology).

---

## Deployment

Production runs behind **Traefik** on one subdomain under
`*.vistacompute1.ucmerced.edu` — Traefik terminates HTTPS and routes the static
SPA (nginx) and the `/api/*` weather proxies. It lives in
[`deploy/`](deploy/README.md):

```bash
cd deploy
cp ../frontend/.env.production.example ../frontend/.env.production
docker compose up -d --build
```

Key points: weather APIs **require** the `/api/*` proxy in prod (a bare static
host breaks data), and the Traefik dashboard is loopback-only (reach it via
`ssh -L 8080:localhost:8080 <server>`).

---

## Project layout

```
frontend/src/
  api/        provider contracts + clients (gridMet, climate, openMeteo)
  calcs/      pure agronomic math (gdd, chill, kc, vpd, analytics, stageProjection)
  components/ React UI (Dashboard, FieldManager, SetupPanel, …)
  config/     env-driven config (gridmet, climate, …)
  types/      domain types (FieldConfig, WeatherRecord, CropProfile, …)
  utils/      localStorage persistence (fields, per-field prefs), helpers
deploy/       Traefik prod stack: docker-compose.yml + Dockerfile (nginx SPA) + traefik/{traefik,dynamic}.yml
```
