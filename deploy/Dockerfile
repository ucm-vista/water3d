# syntax=docker/dockerfile:1
#
# Static SPA image for Water 3D — the Vite bundle served by nginx behind Traefik.
#
# Traefik terminates TLS and does all routing/proxying. This image is JUST
# the frontend. Build context is the REPO ROOT so the frontend source is in
# scope. Rebuild whenever the frontend or the baked-in VITE_* values
# (frontend/.env.production) change.

# ---- build stage: compile the static SPA bundle ---------------------------
# Vite bakes VITE_* values into the bundle at build time, reading
# frontend/.env.production. Rebuild the image whenever those values change.
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- runtime stage: nginx serving the static bundle -----------------------
FROM nginx:1-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
