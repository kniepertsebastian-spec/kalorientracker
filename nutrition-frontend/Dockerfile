# Kalorientracker PWA: static build, served by Caddy. Built by the Fitnesstracker's docker-compose
# files (service `nutrition-frontend`, context ../kalorientracker/nutrition-frontend).
FROM node:22.23-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2.11-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
