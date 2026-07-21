# Deploying Water 3D (Traefik edge, *.vistacompute1.ucmerced.edu)

Production runs behind **Traefik** on the `*.vistacompute1.ucmerced.edu`
wildcard — any host in that zone reaches the app (the canonical name is
`water3d.vistacompute1.ucmerced.edu`). Traefik terminates HTTPS with a
**wildcard cert** and reverse-proxies the weather APIs under `/api/*` (the prod
replacement for the Vite dev proxy). A tiny **nginx** container serves the
static SPA. There is no backend — user data stays in the browser.

```
                    ┌──────────── water3d_edge network ─────────────┐
 visitor ──https──▶ │  traefik (:80 :443)                           │
   (:80 :443)       │    *.vistacompute1…   → web (nginx, SPA)      │
                    │      …/api/*          → weather upstreams     │
                    │                                               │
                    │  web (nginx :80)   static dist/               │
                    └───────────────────────────────────────────────┘
   dashboard (loopback only): traefik :8080/dashboard/
```

Routing lives in two places:

- **`deploy/traefik/traefik.yml`** — static config: entry points, providers,
  dashboard.
- **`deploy/traefik/dynamic.yml`** — hot-reloaded: the `/api/*` weather proxies
  and shared middlewares (security headers, gzip). This replaces the old
  Caddyfile's `handle_path` blocks (`stripPrefix` = `handle_path`,
  `passHostHeader: false` = `header_up Host`).
- The **web** router is **docker labels** in `docker-compose.yml`.

## Prerequisites

- A server with Docker + Compose, ports **80** and **443** open.
- The app's chosen name (e.g. `water3d.vistacompute1.ucmerced.edu`) resolving to
  this box. Any name in the `*.vistacompute1.ucmerced.edu` zone routes to the app.
- A **wildcard TLS cert** for `*.vistacompute1.ucmerced.edu` (from UC Merced IT).
  A wildcard can't be issued by Let's Encrypt HTTP-01 — see *TLS options* below
  for the ACME single-host alternative.

## One-time setup

```bash
cd deploy

# 1. Frontend prod config (baked into the bundle at build time)
cp ../frontend/.env.production.example ../frontend/.env.production
#    no keys needed — the map stack (Esri tiles + OSM Nominatim) is keyless.

# 2. Wildcard TLS cert — drop the cert + key into deploy/certs/ (git-ignored):
#    certs/vistacompute1.crt   full chain (leaf + intermediates), PEM
#    certs/vistacompute1.key   private key, PEM

# 3. Build + start
docker compose up -d --build
```

Visit `https://water3d.vistacompute1.ucmerced.edu`.

## TLS options

**Default — provided wildcard cert.** The whole point of the wildcard: one
`*.vistacompute1.ucmerced.edu` cert covers every subdomain. Put `vistacompute1.crt`
+ `vistacompute1.key` in `deploy/certs/`; Traefik serves them by SNI
(`deploy/traefik/dynamic.yml` → `tls.certificates`). No renewal automation — swap
the files and `docker compose restart traefik` when the cert rotates.

**Alternative — Let's Encrypt HTTP-01** (auto-renewing, but **single host only**,
no wildcard). Use this if you'd rather auto-issue a cert for one specific name and
that name is publicly reachable on port 80:

1. In `docker-compose.yml`, uncomment the four `certificatesresolvers.letsencrypt`
   flags in the traefik `command`, the `traefik_letsencrypt` volume mount, and its
   `volumes:` declaration; set `ACME_EMAIL` (env or `deploy/.env`).
2. Change the **web** router rule from `HostRegexp(...)` to
   `Host(`water3d.vistacompute1.ucmerced.edu`)` and add a
   `traefik.http.routers.w3d-web.tls.certresolver=letsencrypt` label.
3. Remove/ignore the `deploy/certs` mount.

**Alternative — Let's Encrypt DNS-01** (auto-renewing *and* wildcard) is possible
if UC Merced's DNS has a Traefik-supported provider + API credentials; not wired
here since the provider is site-specific.

## The dashboard (loopback only)

The Traefik dashboard is not exposed on the public domain — it binds to the
host's loopback. Reach it over SSH:

```bash
ssh -L 8080:localhost:8080 <server>
# Traefik routing overview → http://localhost:8080/dashboard/
```

## Updating

- **Frontend change** → rebuild the web image (the bundle is baked in):
  `docker compose up -d --build web`
- **Routing / proxy / TLS change** (`traefik/dynamic.yml`) → mounted and
  watched, so it hot-reloads with no restart. Changes to `traefik.yml` or the
  compose `command`/labels need `docker compose up -d`.

## Production checklist

- [ ] `frontend/.env.production` created.
- [ ] **Pin** the Traefik image tag (currently `traefik:v3.3`).
- [ ] Confirm the Traefik dashboard shows the `web` and three weather
      routers all green.

## Notes / known constraints

- **Weather APIs must stay on the `/api/*` proxy paths.** The app calls relative
  paths that Traefik maps to the upstream hosts (`stripPrefix` strips the
  prefix, `passHostHeader: false` rewrites Host — exactly like the Vite dev
  proxy). Pointing the `VITE_*_PROXY_BASE_URL` vars at the upstreams directly
  will hit CORS.
- **`/api/*` is reserved for the weather proxies** (priority 100); the SPA is
  the catch-all (priority 1).
