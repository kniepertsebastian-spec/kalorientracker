# Progress-Log – Kalorientracker & Fitnesstracker

## Roadmap-Übersicht
| Roadmap | Fokus | Status | Abgeschlossen am |
| :--- | :--- | :--- | :--- |
| `ROADMAP-01-INFRA` | Docker, Caddy, Cookie-SSO, Redis | Abgeschlossen | 2026-11-25 13:00 |
| `ROADMAP-02-BACKEND-DATA` | Prisma-Schema, BLS 4.0, API-Kern, Export | Abgeschlossen | 2026-11-25 16:08 |
| `ROADMAP-03-FRONTEND-PWA` | Design-System, Offline-Sync, Logging-UI | Offen | – |
| `ROADMAP-04-AI-CAPTURE` | Barcode, Scan & Learn, Sprache, KI-Rezeptimport | Offen | – |
| `ROADMAP-05-INTEGRATION-QA` | Fitness-Sync, E2E-Tests, iOS-Feinschliff | Offen | – |

---

<!-- Neue Einträge immer direkt HIER unter dieser Linie einfügen (neuester Timestamp zuerst) -->

## [2026-11-25 16:08 CET] – ROADMAP-02: Backend, Lebensmittel-DB und API live
- **Roadmap-Status:** Abgeschlossen
- **Abgeschlossene Roadmaps bisher:** ROADMAP-01, ROADMAP-02
- **Was wurde umgesetzt:**
  - Fitnesstracker-Repo, Branch `feature/nutrition-02-backend-data`, PR #116 (gestapelt auf #115): Migration `20261125121246_nutrition_core` mit `pg_trgm` (nur neue Tabellen), Modelle `Food`, `FoodUnit`, `Recipe`, `RecipeIngredient`, `MealLog`, `MealEntry`, `DailyNutritionRating`, `NutritionSettings`.
  - Lebensmittel-Schichten: eigene (LWW), BLS 4.0 (`backend/src/modules/foods/blsImport.ts`, `backend/src/lib/xlsx.ts`, Skript `bls:import`), Open Food Facts per Barcode mit Cache (`openFoodFacts.ts`); Trigramm-Suche mit Tippfehlertoleranz und Synonymen (`food.service.ts`), eigene Einträge zuerst, Quellenangabe je Treffer.
  - Rechnen in `backend/src/modules/nutrition/nutrients.ts`: Rohgewicht → Endgewicht → 100 g/Portion, Fallback Rohsumme, keine Division durch 0, ml→g nur mit Dichte. Audit (`nutrition-math-auditor`) fand eine Lücke: Gramm-Portionen von Rezepten mit geschätztem Gewicht galten als exakt; behoben, Integrationstest ergänzt.
  - API: foods/food-units, recipes (+ `calculate`), meals/meal-entries (append-only Snapshots), ratings (append-only), `targets/today`, settings, Delta-Sync, Export PDF/CSV/MD/JSON.
  - Tests: 63 Dateien / 391 Tests grün (inkl. Protein-Pasta 10 ml Öl = 9,1 g mit Kochverlust, Snapshot nach Lebensmittel-Änderung), Lint, Typecheck, `prisma validate`, `migrate diff` ohne Abweichung.
  - Deploy: Prod-Backup `~/fitnesstracker-backups/20261125T150304Z`, Backend aus `~/ft-nutrition-02` neu gebaut (nur Service `backend`), Migration beim Start angewendet, BLS 4.0 in Prod importiert (7 140 Lebensmittel, 16 s).
  - Live-Check mit dem Test-Account (`e2e/api-roadmap02-check.py`, auf dem Server mit `python3`, nur Allowlist-Ausgabe): Suche (Haferflocken, Brokoli, Olivenoel, Ei, Nudeln, Hühnerbrust) liefert die passenden BLS-Einträge zuerst, Barcode Nutella über OFF, Snapshot bleibt nach Änderung des Lebensmittels gleich, Rezeptrechnung, alle vier Exportformate, Testdaten wieder gelöscht.
- **Stehengeblieben bei / Offene Punkte:**
  - PR #115 und danach #116 mergen; dann den Stack aus `~/fitnesstracker` neu deployen und die Worktrees `~/ft-nutrition-01` und `~/ft-nutrition-02` entfernen. Bis dahin läuft das Backend aus `~/ft-nutrition-02` (Compose-Projekt `fitnesstracker`), die übrigen Dienste aus `~/ft-nutrition-01`.
  - Teilweise Eingaben wie „Haferfl“ finden Haferflocken erst weiter unten (akzeptiert, ggf. Präfix-Bonus in ROADMAP-03 nachschärfen, wenn die Such-UI steht).
  - Der nächtliche Backup-Cron läuft aus `~/fitnesstracker`; manuell aus einem Worktree braucht `scripts/backup.sh` `COMPOSE_PROJECT_NAME=fitnesstracker`.
- **Nächster konkreter Schritt:**
  - ROADMAP-03 starten: `docs/roadmaps/roadmap_03_frontend_pwa.md` lesen, Dexie-Schema gegen `GET/POST /api/nutrition/sync` entwerfen und mit dem Skill `design-system-review` die ersten Screens prüfen.

## [2026-11-25 13:00 CET] – ROADMAP-01: Abnahme bestanden, Roadmap abgeschlossen
- **Roadmap-Status:** Abgeschlossen
- **Abgeschlossene Roadmaps bisher:** ROADMAP-01
- **Was wurde umgesetzt:**
  - SSO-Abnahme live mit dem Test-Account (Playwright, 390×844, `e2e/sso-acceptance.mjs`, Start mit `e2e/run-sso.sh` auf dem Server): Login im Fitnesstracker → Kalorientracker ohne zweite Anmeldung, Refresh-Cookie `Domain=pwa-tree.de`, `HttpOnly`, `Secure`, `SameSite=Strict`; keine 401/403-Schleife; Session übersteht Reload; Logout im Kalorientracker meldet auch den Fitnesstracker ab. Manifest und Service Worker aktiv, kein Overflow, keine Konsolenfehler. 14/14 PASS.
  - Zusätzlich auf API-Ebene: Login über kcal-Host, Session über fitness-Host, Logout über fitness-Host beendet die kcal-Session.
  - `nutrition-frontend/src/styles.css`: Humor-Toggle als 44-px-Touch-Target, Buttons/Inputs erben die App-Schrift. Neu deployt.
  - Hinweis: Ein erstes Prüfskript hat wegen eines Redaction-Fehlers Token des Test-Accounts in der Session ausgegeben; der Refresh-Token wurde sofort per Logout widerrufen, der Access-Token ist nach 15 min abgelaufen. Das Skript im Repo gibt nur noch eine Allowlist aus.
- **Stehengeblieben bei / Offene Punkte:**
  - Fitnesstracker-PR #115 mergen, danach den Stack aus `~/fitnesstracker` neu deployen und erst dann den Worktree `~/ft-nutrition-01` entfernen.
  - Offline-/Sync-Teil des E2E-Ablaufs entfällt hier (die PWA-Hülle speichert noch keine Daten); kommt mit ROADMAP-03.
- **Nächster konkreter Schritt:**
  - ROADMAP-02 starten: `docs/roadmaps/roadmap_02_backend_daten.md` lesen, Prisma-Schema für Foods/Meals/Recipes entwerfen und mit dem Skill `prisma-migration-guard` prüfen.

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
