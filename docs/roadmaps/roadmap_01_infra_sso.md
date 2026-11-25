# Teil-Roadmap 01: Infrastruktur, SSO & Betrieb

- **Welle:** 1 (Start, parallel zu Teil-Roadmap 02)
- **Abhängigkeiten:** Keine (Blocker für produktive Deployments)
- **Ziel:** Beide PWAs laufen sauber getrennt im Docker-Setup mit gemeinsamem Single Sign-on (SSO) über Subdomains.
- **Relevante Dateien:** `docker-compose.yml`, `docker-compose.prod.yml`, `Caddyfile`, `backend/src/plugins/*`, `.env.example`
- **Empfohlener Claude-Skill:** `server-ops-check`
- **Status:** In Arbeit – offen: Fitness-Login/Logout live mit Test-Account, SSO-Abnahme im Browser (Route `kcal.pwa-tree.de` live seit 2026-11-25 12:44)

---

## Arbeitspakete

### [P0] Caddy-Routing & Cookie-SSO
- [x] Subdomains im `Caddyfile` konfigurieren (`fitness.domain.de`, `kalorien.domain.de`, `api.domain.de`). (erledigt: 2026-11-25 12:40) – umgesetzt als `fitness.pwa-tree.de` (Caddy `:80`) und `kcal.pwa-tree.de` (Caddy `:8080`) hinter dem Cloudflare-Tunnel; statt `api.`-Subdomain same-origin `/api` je App.
- [x] Bestehende JWT-/HttpOnly-Cookie-Auth im Backend so konfigurieren, dass das Session-Cookie für die Root-Domain gültig ist (`Domain=.domain.de`, `HttpOnly`, `Secure`, `SameSite=Lax`). (erledigt: 2026-11-25 12:40) – `COOKIE_DOMAIN=pwa-tree.de`, `backend/src/lib/refreshCookie.ts`; `SameSite=Strict` beibehalten (Subdomains sind same-site), altes host-only Cookie wird mitgelöscht.
- [x] CORS-Konfiguration im Backend (`cors.plugin.ts`) um die neue Kalorientracker-Origin erweitern. (erledigt: 2026-11-25 12:40) – `CORS_EXTRA_ORIGINS` (Dev, `localhost:5174`); in Produktion same-origin, kein CORS nötig.
- [ ] Sicherstellen, dass bestehende Login- und Logout-Flows im Fitnesstracker unverändert funktionieren. – Integrationssuite grün (2026-11-25); Live-Test offen: Test-Account existiert in Prod nicht (Login 401).

### [P0] Docker-Compose-Erweiterung
- [x] Neuen Service `nutrition-frontend` (zunächst als minimale PWA-Hülle) in `docker-compose.yml` und `docker-compose.prod.yml` ergänzen. (erledigt: 2026-11-25 12:40) – `nutrition-frontend/` (React + Vite + PWA, Caddy).
- [x] `redis`-Container für Job-Queues (BullMQ) und Rate-Limiting hinzufügen (inkl. Healthcheck). (erledigt: 2026-11-25 12:40)
- [x] `worker`-Container (Node.js/BullMQ + vorinstalliertes `yt-dlp` für Phase 4) im Compose-Setup anlegen. (erledigt: 2026-11-25 12:40) – `worker/` (inkl. ffmpeg, Heartbeat-Healthcheck).
- [x] `.env.example` um alle neuen Umgebungsvariablen (Redis-URL, Cookie-Domain, Media-Pfad, KI-Budgets) ergänzen. (erledigt: 2026-11-25 12:40)

### [P1] Media-Storage
- [x] Dediziertes Docker-Volume (oder MinIO-Container) für Uploads (Nährwertfotos, Kochbuchseiten, temporäre Videos) einrichten – keine Binärdaten in PostgreSQL. (erledigt: 2026-11-25 12:40) – Volume `media` (`tmp/`, `scans/`), Backend `/app/backend/media`, Worker `/data/media`.
- [x] Bildkomprimierung (WebP via `sharp`) und Größenlimits im Backend konfigurieren. (erledigt: 2026-11-25 12:40) – `backend/src/lib/media.ts` (`MEDIA_MAX_UPLOAD_MB`, `MEDIA_MAX_IMAGE_EDGE_PX`, `MEDIA_WEBP_QUALITY`).

### [P2] Betrieb, Backups & Sicherheit
- [x] Automatisierten täglichen `pg_dump`-Backup-Cronjob/Container für die gemeinsame PostgreSQL-Datenbank einrichten. (erledigt: 2026-11-25 12:40) – Host-Cron 03:30 mit `scripts/backup.sh` (DB, `uploads`, `media`).
- [x] Redis-basiertes Rate-Limiting und Tagesbudgets für KI-Endpunkte vorbereiten. (erledigt: 2026-11-25 12:40) – `backend/src/lib/redis.ts`, `backend/src/lib/aiBudget.ts`.
- [x] Automatische Bereinigung (Cleanup-Job) für temporäre Video- und Foto-Uploads nach abgeschlossener KI-Analyse einrichten. (erledigt: 2026-11-25 12:40) – BullMQ-Scheduler `kcal-maintenance`, löscht `media/tmp` nach `MEDIA_TMP_TTL_HOURS`; das Löschen direkt nach einer Analyse kommt mit den KI-Jobs (Roadmap 04).

---

## Sicherheits- & Betriebsregeln
- Keine Secrets oder Passwörter ins Git-Repository committen.
- Auf dem Server niemals `docker compose down -v` oder destruktive Volume-Befehle ohne explizite Freigabe ausführen.
- SSH-Zugang läuft lokal über `~/.ssh/config` (z. B. `ssh fitness-server`).

## Abnahme-Kriterium (Done)
- Ein Login im Fitnesstracker authentifiziert automatisch auch die Kalorien-PWA ohne zweite Anmeldung.
- Alle Container (`fitness-frontend`, `nutrition-frontend`, `backend`, `worker`, `postgres`, `redis`, `caddy`) laufen im Status `healthy` / `Up`.