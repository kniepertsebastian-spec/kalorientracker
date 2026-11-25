# Progress-Log – Kalorientracker & Fitnesstracker

## Roadmap-Übersicht
| Roadmap | Fokus | Status | Abgeschlossen am |
| :--- | :--- | :--- | :--- |
| `ROADMAP-01-INFRA` | Docker, Caddy, Cookie-SSO, Redis | In Arbeit (live, Abnahme mit Test-Account offen) | – |
| `ROADMAP-02-BACKEND-DATA` | Prisma-Schema, BLS 4.0, API-Kern, Export | Offen | – |
| `ROADMAP-03-FRONTEND-PWA` | Design-System, Offline-Sync, Logging-UI | Offen | – |
| `ROADMAP-04-AI-CAPTURE` | Barcode, Scan & Learn, Sprache, KI-Rezeptimport | Offen | – |
| `ROADMAP-05-INTEGRATION-QA` | Fitness-Sync, E2E-Tests, iOS-Feinschliff | Offen | – |

---

<!-- Neue Einträge immer direkt HIER unter dieser Linie einfügen (neuester Timestamp zuerst) -->

## [2026-11-25 12:44 CET] – ROADMAP-01: Cloudflare-Route für kcal.pwa-tree.de live
- **Roadmap-Status:** In Arbeit (nur noch Live-Abnahme mit Test-Account offen)
- **Abgeschlossene Roadmaps bisher:** keine
- **Was wurde umgesetzt:**
  - Public Hostname `kcal.pwa-tree.de` → `http://fitnesstracker-caddy:8080` im Cloudflare-Tunnel angelegt (durch den Nutzer).
  - Extern geprüft: `/`, `/api/health`, `/manifest.webmanifest`, `/sw.js` jeweils 200; `POST /api/auth/session` ohne Cookie → `{"authenticated":false}`; fitness.pwa-tree.de unverändert 200.
- **Stehengeblieben bei / Offene Punkte:**
  - Test-Account aus `.env.claude.local` existiert in der Prod-DB nicht (Login 401); Anlegen braucht Freigabe. Danach: SSO-Live-Test und Fitness-Login/Logout-Live-Test.
- **Nächster konkreter Schritt:**
  - Test-Account anlegen (mit Freigabe), dann Skill `pwa-e2e-inspector` gegen `https://kcal.pwa-tree.de` und ROADMAP-01 abschließen.

## [2026-11-25 12:40 CET] – ROADMAP-01: Infrastruktur, Cookie-SSO, Redis, Worker, Medien
- **Roadmap-Status:** In Arbeit (alles umgesetzt und deployt, Abnahme offen)
- **Abgeschlossene Roadmaps bisher:** keine
- **Was wurde umgesetzt:**
  - Fitnesstracker, Branch `feature/nutrition-01-infra-sso`, PR #115 (Worktree `~/ft-nutrition-01`): `COOKIE_DOMAIN`-SSO (`backend/src/lib/refreshCookie.ts`, `auth.routes.ts`), `CORS_EXTRA_ORIGINS` (`plugins/cors.plugin.ts`), Redis für Rate-Limits (`lib/redis.ts`), KI-Tagesbudgets (`lib/aiBudget.ts`), WebP-Medien via sharp (`lib/media.ts`), Caddy-Block `:8080`, Compose-Services `redis`, `worker`, `nutrition-frontend`, Volumes `media`/`redisdata`, `.env.example`, `scripts/backup.sh`/`restore.sh` inkl. `media`. Keine Prisma-Migration.
  - Dieses Repo: `nutrition-frontend/` (PWA-Hülle mit Session-Check, Login, Humor-Toggle, Design-Tokens, Manifest, Service Worker) und `worker/` (BullMQ, Cleanup-Job für `media/tmp`, yt-dlp, ffmpeg, Heartbeat-Healthcheck), `README.md`.
  - Tests: Backend Typecheck, Lint, Unit- und komplette Integrationssuite (frische Postgres), `prisma validate`, `caddy validate`, `docker compose config`; Frontend 7 und Worker 5 Vitest-Tests, Build OK.
  - Deploy: Backup vorher (`~/fitnesstracker-backups/20261125T113324Z`), `.env` ergänzt (Backup `.env.bak-20261125-predeploy`), alle Container `healthy`/`Up`; fitness.pwa-tree.de unverändert 200; kcal intern (`caddy:8080`) inkl. `/api/health`, Manifest, `sw.js` 200. Nächtliches Backup per Cron (03:30).
- **Stehengeblieben bei / Offene Punkte:**
  - Cloudflare-Tunnel: Public Hostname `kcal.pwa-tree.de` → `http://fitnesstracker-caddy:8080` fehlt noch (kein DNS).
  - Test-Account aus `.env.claude.local` existiert in der Prod-DB nicht (Login 401) – SSO-Live-Test und Fitness-Login/Logout-Live-Test daher offen. Anlegen braucht Freigabe.
  - Der Live-Stack läuft bis zum Merge von PR #115 aus dem Worktree `~/ft-nutrition-01` (Caddyfile, Compose); danach aus `~/fitnesstracker` neu deployen, Worktree erst dann entfernen.
- **Nächster konkreter Schritt:**
  - Nach Cloudflare-Route und Test-Account: Skill `pwa-e2e-inspector` gegen `https://kcal.pwa-tree.de` (Login im Fitnesstracker → Kalorientracker ohne zweite Anmeldung), dann ROADMAP-01 abschließen und mit ROADMAP-02 (Prisma-Schema, BLS 4.0) starten.
