# Kalorientracker BullMQ worker. Built by the Fitnesstracker's docker-compose files
# (service `worker`, context ../kalorientracker/worker).
FROM node:22.23-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src src
RUN npm run build && npm prune --omit=dev

FROM node:22.23-alpine AS runtime
# yt-dlp (+ ffmpeg for audio extraction/merging) for the recipe import from video links (Roadmap 04).
RUN apk add --no-cache yt-dlp ffmpeg
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/dist dist
# Mount point of the shared media volume. Not /media: Alpine ships /media/{cdrom,floppy,usb}, which
# Docker would copy into a fresh volume. Owned by node, so a fresh volume starts out writable.
RUN mkdir -p /data/media && chown node:node /data/media
# Same uid (1000) as the backend's `node` user, which owns the shared media volume.
USER node
# Healthy while the heartbeat (written every 30 s, only when Redis answers) is fresh.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD [ -n "$(find /tmp/worker-heartbeat -mmin -2 2>/dev/null)" ] || exit 1
CMD ["node", "dist/index.js"]
