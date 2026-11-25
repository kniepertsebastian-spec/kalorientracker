# Kalorientracker

Zweite PWA neben dem [Fitnesstracker](https://github.com/kniepertsebastian-spec/fitnesstracker),
am selben Backend. Der Fitnesstracker bleibt führend für Körperdaten, Training und Zielwerte
(Grundumsatz, Gesamtumsatz, Zielkalorien, Zielprotein). Der Kalorientracker liest sie über die API
und rechnet sie nicht selbst nach. Regeln und Roadmaps: `.claude/CLAUDE.md`, `docs/`.

## Aufbau

| Teil | Wo | Was |
| :--- | :--- | :--- |
| Backend, Datenbank, Login | Fitnesstracker-Repo (`backend/`) | Fastify + Prisma + PostgreSQL, ein Konto für beide Apps |
| `nutrition-frontend/` | dieses Repo | React + Vite + TypeScript, PWA (vite-plugin-pwa), ausgeliefert von Caddy |
| `worker/` | dieses Repo | BullMQ-Worker (Redis) mit yt-dlp und ffmpeg; räumt bisher `media/tmp` auf |
| Compose, Caddy, Redis | Fitnesstracker-Repo | `docker-compose.prod.yml` baut `worker` und `nutrition-frontend` aus diesem Repo |

Die PWA ruft die API same-origin unter `/api` auf: Caddy leitet `kcal.pwa-tree.de/api` an dasselbe
Backend weiter wie `fitness.pwa-tree.de/api`. Kein CORS in Produktion.

**Single Sign-on:** Mit `COOKIE_DOMAIN=pwa-tree.de` im Backend gilt das Refresh-Cookie
(`HttpOnly`, `Secure`, `SameSite=Strict`, Pfad `/api/auth`) für beide Subdomains. Beim Start fragt
die PWA `POST /api/auth/session` und ist ohne zweite Anmeldung drin. Ausnahme iOS: Installierte
PWAs haben dort getrennte Cookie-Speicher, man meldet sich je App einmal an.

## Entwicklung

Node 22. Backend und Datenbank kommen aus dem Fitnesstracker-Repo (`docker compose up` dort,
Backend auf `localhost:3000`). Dort in `.env`: `CORS_EXTRA_ORIGINS=http://localhost:5174`.

```sh
cd nutrition-frontend
npm ci
npm run dev        # http://localhost:5174, /api → API_PROXY_TARGET (Standard http://localhost:3000)
npm test           # Vitest
npm run build      # tsc + vite build, erzeugt sw.js und Manifest

cd ../worker
npm ci
npm test
npm run build && MEDIA_DIR=../media npm start
```

Redis, Worker und PWA-Container lassen sich im Fitnesstracker-Repo auch per
`docker compose --profile nutrition up` starten (Repo liegt daneben, sonst `KALORIENTRACKER_DIR`).

### Worker-Umgebung

| Variable | Standard | Bedeutung |
| :--- | :--- | :--- |
| `REDIS_URL` | `redis://localhost:6379` | Redis für BullMQ |
| `MEDIA_DIR` | `/data/media` | gemeinsames Medien-Volume (das Backend sieht es als `/app/backend/media`) |
| `MEDIA_TMP_TTL_HOURS` | `24` | Dateien in `MEDIA_DIR/tmp` werden danach gelöscht |
| `CLEANUP_EVERY_MINUTES` | `60` | Takt des Aufräum-Jobs |
| `HEARTBEAT_FILE` | `/tmp/worker-heartbeat` | Docker-Healthcheck prüft, ob es jünger als 2 min ist |

## Deployment

Läuft im Compose-Projekt `fitnesstracker` auf dem Server (`~/kalorientracker` neben
`~/fitnesstracker`). Nach Änderungen hier (bis Fitnesstracker-PR #115 gemergt ist, aus dem
Worktree `~/ft-nutrition-01` mit `-p fitnesstracker`):

```sh
cd ~/fitnesstracker
docker compose -f docker-compose.prod.yml build worker nutrition-frontend
docker compose -f docker-compose.prod.yml up -d worker nutrition-frontend
```

Öffentlich erreichbar über den Cloudflare-Tunnel: Public Hostname `kcal.pwa-tree.de` →
`http://fitnesstracker-caddy:8080` (Caddy-Block `:8080` im Fitnesstracker-Repo).

Backups: `scripts/backup.sh` im Fitnesstracker-Repo sichert Datenbank, `uploads` und `media`
(ohne `tmp/`), nächtlich per Cron.

## Live-Tests

`e2e/run-sso.sh` (auf dem Server) prüft das SSO beider PWAs im Browser: Login im
Fitnesstracker, Kalorientracker ohne zweite Anmeldung, gemeinsamer Logout, Manifest, Service
Worker, Mobile-Layout. Gibt nur PASS/FAIL aus, nie Zugangsdaten oder Token.

Nur mit dem Test-Account aus `.env.claude.local` (`TEST_PWA_URL`, `TEST_PWA_EMAIL`,
`TEST_PWA_PASSWORD`). Die Datei ist in `.gitignore` und gehört nie ins Repo.
