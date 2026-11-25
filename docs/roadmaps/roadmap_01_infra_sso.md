# Teil-Roadmap 01: Infrastruktur, SSO & Betrieb

- **Welle:** 1 (Start, parallel zu Teil-Roadmap 02)
- **Abhängigkeiten:** Keine (Blocker für produktive Deployments)
- **Ziel:** Beide PWAs laufen sauber getrennt im Docker-Setup mit gemeinsamem Single Sign-on (SSO) über Subdomains.
- **Relevante Dateien:** `docker-compose.yml`, `docker-compose.prod.yml`, `Caddyfile`, `backend/src/plugins/*`, `.env.example`
- **Empfohlener Claude-Skill:** `server-ops-check`

---

## Arbeitspakete

### [P0] Caddy-Routing & Cookie-SSO
- [ ] Subdomains im `Caddyfile` konfigurieren (`fitness.domain.de`, `kalorien.domain.de`, `api.domain.de`).
- [ ] Bestehende JWT-/HttpOnly-Cookie-Auth im Backend so konfigurieren, dass das Session-Cookie für die Root-Domain gültig ist (`Domain=.domain.de`, `HttpOnly`, `Secure`, `SameSite=Lax`).
- [ ] CORS-Konfiguration im Backend (`cors.plugin.ts`) um die neue Kalorientracker-Origin erweitern.
- [ ] Sicherstellen, dass bestehende Login- und Logout-Flows im Fitnesstracker unverändert funktionieren.

### [P0] Docker-Compose-Erweiterung
- [ ] Neuen Service `nutrition-frontend` (zunächst als minimale PWA-Hülle) in `docker-compose.yml` und `docker-compose.prod.yml` ergänzen.
- [ ] `redis`-Container für Job-Queues (BullMQ) und Rate-Limiting hinzufügen (inkl. Healthcheck).
- [ ] `worker`-Container (Node.js/BullMQ + vorinstalliertes `yt-dlp` für Phase 4) im Compose-Setup anlegen.
- [ ] `.env.example` um alle neuen Umgebungsvariablen (Redis-URL, Cookie-Domain, Media-Pfad, KI-Budgets) ergänzen.

### [P1] Media-Storage
- [ ] Dediziertes Docker-Volume (oder MinIO-Container) für Uploads (Nährwertfotos, Kochbuchseiten, temporäre Videos) einrichten – keine Binärdaten in PostgreSQL.
- [ ] Bildkomprimierung (WebP via `sharp`) und Größenlimits im Backend konfigurieren.

### [P2] Betrieb, Backups & Sicherheit
- [ ] Automatisierten täglichen `pg_dump`-Backup-Cronjob/Container für die gemeinsame PostgreSQL-Datenbank einrichten.
- [ ] Redis-basiertes Rate-Limiting und Tagesbudgets für KI-Endpunkte vorbereiten.
- [ ] Automatische Bereinigung (Cleanup-Job) für temporäre Video- und Foto-Uploads nach abgeschlossener KI-Analyse einrichten.

---

## Sicherheits- & Betriebsregeln
- Keine Secrets oder Passwörter ins Git-Repository committen.
- Auf dem Server niemals `docker compose down -v` oder destruktive Volume-Befehle ohne explizite Freigabe ausführen.
- SSH-Zugang läuft lokal über `~/.ssh/config` (z. B. `ssh fitness-server`).

## Abnahme-Kriterium (Done)
- Ein Login im Fitnesstracker authentifiziert automatisch auch die Kalorien-PWA ohne zweite Anmeldung.
- Alle Container (`fitness-frontend`, `nutrition-frontend`, `backend`, `worker`, `postgres`, `redis`, `caddy`) laufen im Status `healthy` / `Up`.