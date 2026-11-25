# Progress-Log – Kalorientracker & Fitnesstracker

## Roadmap-Übersicht
| Roadmap | Fokus | Status | Abgeschlossen am |
| :--- | :--- | :--- | :--- |
| `ROADMAP-01-INFRA` | Docker, Caddy, Cookie-SSO, Redis | Abgeschlossen | 2026-11-25 13:00 |
| `ROADMAP-02-BACKEND-DATA` | Prisma-Schema, BLS 4.0, API-Kern, Export | Abgeschlossen | 2026-11-25 16:08 |
| `ROADMAP-03-FRONTEND-PWA` | Design-System, Offline-Sync, Logging-UI | Abgeschlossen | 2026-11-25 16:57 |
| `ROADMAP-04-AI-CAPTURE` | Barcode, Scan & Learn, Sprache, KI-Rezeptimport | Abgeschlossen (KI-Live-Abnahme offen) | 2026-11-25 20:35 |
| `ROADMAP-05-INTEGRATION-QA` | Fitness-Sync, E2E-Tests, iOS-Feinschliff | Abgeschlossen (Echtgerät-Abnahme offen) | 2026-11-25 21:47 |

---

<!-- Neue Einträge immer direkt HIER unter dieser Linie einfügen (neuester Timestamp zuerst) -->

## [2026-11-25 22:09 CET] – ROADMAP-05: Nachtrag App-Shortcuts „Snack“ und „Sprache“
- **Roadmap-Status:** Abgeschlossen (Nachtrag)
- **Abgeschlossene Roadmaps bisher:** ROADMAP-01, ROADMAP-02, ROADMAP-03, ROADMAP-04, ROADMAP-05
- **Was wurde umgesetzt:**
  - Manifest-Shortcuts in `nutrition-frontend/vite.config.ts`: `/#snack` (Sprach-Sheet mit fokussiertem Textfeld, Mahlzeit Snack) und `/#sprache` (Aufnahme); gleiche Shortcuts im TWA-Template `android/twa-manifest.template.json`.
  - `src/lib/shortcuts.ts` (+ Test, fing einen Prototyp-Lookup bei `#constructor`), Auswertung in `screens/Today.tsx`, Hash wird danach durch `#heute` ersetzt; `VoiceSheet` mit `focusText`.
  - 8 Dateien / 58 Vitest-Tests grün, Typecheck und Build sauber; `nutrition-frontend` deployt, Manifest liefert beide Shortcuts aus.
- **Stehengeblieben bei / Offene Punkte:**
  - Login des Test-Accounts schlägt seit 2026-11-25 21:59 CET mit „Invalid email or password“ fehl (Account und `.env.claude.local` unverändert); E2E-Klicktest der Shortcuts steht deshalb aus.
  - iOS: keine Manifest-Shortcuts; Weg über die Kurzbefehle-App steht in `docs/MOBILE-ACCEPTANCE.md`.
- **Nächster konkreter Schritt:**
  - Test-Account-Passwort neu setzen und in `.env.claude.local` eintragen, dann `e2e/run-all.sh` und einen Klicktest auf `/#snack` und `/#sprache`.

## [2026-11-25 21:47 CET] – ROADMAP-05: Fitness-Integration, E2E-Suite, Mobile-Abnahme, Feinschliff
- **Roadmap-Status:** Abgeschlossen (Echtgerät-Abnahme offen)
- **Abgeschlossene Roadmaps bisher:** ROADMAP-01, ROADMAP-02, ROADMAP-03, ROADMAP-04, ROADMAP-05
- **Was wurde umgesetzt:**
  - Fitnesstracker-Repo, Branch `feature/nutrition-05-integration`, PR #118 (gestapelt auf #117): `GET /api/nutrition/body-trend?days=7..90` (`backend/src/modules/nutritionTargets/bodyTrend.ts`, ein Punkt pro lokalem Tag, 7-Tage-Mittel gegen Vorwoche, Wasseranteil-Kontext, fehlende Werte bleiben `null`), 6 Unit-Tests und ein Integrationstest. Gemini-Fallback aller KI-Module auf `gemini-3.5-flash-lite`, Hinweise in `GeminiKeyHelp.tsx` angepasst. Backend 71 Dateien / 525 Tests grün, `prisma validate` ok, keine Migration.
  - Doppelzählung geprüft: Zielkalorien und Zielprotein kommen allein aus `calculateNutrition` im Fitnesstracker; der Kalorientracker addiert keine Aktivitätskalorien.
  - Kalorien-PWA: Körpertrend wird alle 10 min geholt und in Dexie gecacht (`lib/sync.ts`, `useBodyTrend`); Begrüßung und Trainingszeile richten sich nach der Phase (`lib/copy.ts`, `App.tsx`); `screens/Progress.tsx` mit 7-Tage-Makrobilanz, Gewichtstrend-Sparkline und Einordnung „Wasser oder Gewebe?“; Dubletten-Hinweis mit „Rückgängig“ bei gleichem Eintrag innerhalb von 2 min (`lib/actions.ts`, `FoodSheet.tsx`, `Today.tsx`); Maskottchen-Zustände default/Sonnenbrille/drüber/müde; Legacy-Badge in „Mehr“ (max. 40 Zeichen); Lazy-Loading für Scanner, Scan & Learn, Sprache, Rezepte, Fortschritt, Export und Mehr. 7 Dateien / 56 Vitest-Tests grün, Worker 82 Tests grün.
  - E2E-Suite (`e2e/`, Start mit `e2e/run.sh <skript>` oder `e2e/run-all.sh`, gemeinsame Umgebung in `e2e/env.mjs`): `sso-acceptance.mjs` 14/14, `offline-day.mjs` (Offline-Kaltstart, Offline-Logging, Delta-Sync, 1–10-Bewertung), `capture.mjs` (Barcode → Scan & Learn), neu `recipes-export.mjs` 25/25 (Rezept 400 g roh → 300 g Endgewicht, Snapshot bleibt nach Rezeptänderung gleich, auch auf zweitem Gerät und im Export; Export 7/14/31/90 Tage, PDF/CSV/MD/JSON) und `mobile.mjs` 28/28 (WebKit/iPhone 13 und 320 px). Alle grün gegen Produktion mit dem Test-Account, Testdaten aufgeräumt.
  - Dabei gefunden und behoben: Schnelleingabe-Sheet bei 320 px 33 px zu breit (Grid jetzt `minmax(0, 1fr)`), Fitnesstracker-Link im Fortschritt nur 17 px hoch (jetzt 44-px-Ziel).
  - CI: `.github/workflows/ci.yml` mit Job `build-test` (Frontend und Worker: tsc, Vitest, Build) und `e2e-live` (nur main, manuell und täglich; wird übersprungen, solange die Secrets `TEST_PWA_EMAIL`/`TEST_PWA_PASSWORD` fehlen; Screenshots als Artefakt).
  - `docs/MOBILE-ACCEPTANCE.md`: automatische Prüfungen und Checkliste für echte Geräte. `android/`: TWA-Gerüst analog zum Fitnesstracker (`de.pwatree.kcal`, Schlüssel außerhalb des Repos in `~/.kalorientracker-android`).
  - Deploy: `backend` aus `~/ft-nutrition-05` und `nutrition-frontend`; DB-Backup `20261125T202833Z` vorher.
- **Stehengeblieben bei / Offene Punkte:**
  - Echtgerät-Abnahme (Home-Screen-Installation iOS, Kamera und Mikrofon auf iPhone und Android) laut `docs/MOBILE-ACCEPTANCE.md`.
  - GitHub-Secrets `TEST_PWA_EMAIL`/`TEST_PWA_PASSWORD` im Kalorientracker-Repo anlegen, sonst läuft nur der Job `build-test`.
  - PRs #115, #116, #117, #118 mergen, danach Deploy aus `~/fitnesstracker` (erst dann ist `GeminiKeyHelp` live) und Worktrees `~/ft-nutrition-0*` entfernen.
  - Test-Account ohne Fitnesstracker-Profil und ohne Gemini-Schlüssel: Zielwerte, Gewichtstrend und KI-Pfade live nur als Empty State bzw. per Unit-/Integrationstest geprüft.
  - TWA-APK optional: `android/build.sh`, danach `assetlinks.json` hinterlegen.
- **Nächster konkreter Schritt:**
  - PRs #115–#118 mergen und aus `~/fitnesstracker` deployen, dann `e2e/run-all.sh` auf dem Server laufen lassen und die Echtgerät-Checkliste in `docs/MOBILE-ACCEPTANCE.md` abarbeiten.

## [2026-11-25 20:35 CET] – ROADMAP-04: Scanner, Scan & Learn, Sprache, Rezeptimport, Wochen-Drops live
- **Roadmap-Status:** Abgeschlossen (Live-Abnahme der KI-Pfade offen)
- **Abgeschlossene Roadmaps bisher:** ROADMAP-01, ROADMAP-02, ROADMAP-03, ROADMAP-04
- **Was wurde umgesetzt:**
  - Fitnesstracker-Repo, Branch `feature/nutrition-04-capture` (gestapelt auf #116): Migration `20261125172433_nutrition_capture` (nur neue Tabellen `RecipeImport`, `NutritionWeeklyDrop` + Enums, FK auf `User`), Modul `backend/src/modules/nutritionCapture/` (Gemini-JSON-Client mit Standard `gemini-3.5-flash-lite`, Plausibilitätscheck 4P+4KH+9F(+2 Ballaststoffe), Etikett-Scan, Sprache mit DB-Abgleich, Rezeptimport mit JSON-LD/KI-Fallback und Konfidenzstatus, Zutatenparser, Wochen-Drops mit Sonntags-Scheduler und 8-Wochen-Sperre), Schemas in `packages/shared/src/schemas/nutritionCapture.schema.ts`. Backend 70 Dateien / 518 Tests grün, `prisma validate` ok.
  - Worker (`worker/src/recipe/`): BullMQ-Queue `kcal-ai`, kostenlose Vorschau (Plattform, Titel), Import-Job mit `yt-dlp` + `ffmpeg` (Untertitel/Audio), SSRF-geschütztes `safeFetch`. 82 Tests grün.
  - Frontend: `screens/Scanner.tsx` (ZXing-Dauerscan, Ton/Vibration, Liste, „Alle übernehmen“ mit Rückgängig, Übergabe an Scan & Learn), `ScanLearn.tsx` (Rückseiten-Foto, gelbe Markierung auffälliger Felder, „Speichern & direkt loggen“), `Voice.tsx` (MediaRecorder statt Web Speech, Text-Fallback, Vorschau mit Kandidaten), `RecipeImport.tsx` (Link/Foto/Video/Text, zweistufig, Konfidenz-Badges und offene Rückfragen, Verwerfen), `WeeklyDrops.tsx` (3–5 Ideen, 1-Tap, „≤ Restbudget“-Filter, Offline-Cache), Share Target im Manifest. 48 Vitest-Tests grün, Typecheck und Build sauber.
  - Live-Abnahme mit dem Test-Account (`e2e/capture.mjs`, Start mit `e2e/run-capture.sh`, 390×844): 22/22 PASS, keine Konsolen- oder HTTP-Fehler, Tag nach dem Lauf unverändert. Dabei gefunden und behoben: Scanner-Zeilen wurden bei 390 px abgeschnitten (jetzt zweizeilig).
  - Deploy: `backend`, `worker`, `nutrition-frontend` aus `~/ft-nutrition-04`; DB-Backup `20261125T175338Z` vorher.
- **Stehengeblieben bei / Offene Punkte:**
  - Test-Account hat keinen Gemini-Schlüssel: Foto-Scan in < 15 s und KI-Rezeptentwurf sind nur per Unit-/Integrationstest geprüft, nicht live.
  - Übrige Fitnesstracker-Module nutzen weiter `gemini-2.5-flash` als Standard (ab 2026-12-01 von Google auf 3.5 Flash-Lite umgeleitet).
  - PRs #115, #116 und der neue Capture-PR müssen gemergt werden; danach Deploy aus `~/fitnesstracker` und Worktrees entfernen.
- **Nächster konkreter Schritt:**
  - ROADMAP-05 starten: `docs/roadmaps/` Roadmap 05 lesen, mit Fitness-Sync und der E2E-Suite beginnen; parallel Gemini-Schlüssel für den Test-Account hinterlegen und `e2e/capture.mjs` um den Foto-Durchlauf erweitern.

## [2026-11-25 16:57 CET] – ROADMAP-03: Kalorien-PWA offline-fähig live
- **Roadmap-Status:** Abgeschlossen
- **Abgeschlossene Roadmaps bisher:** ROADMAP-01, ROADMAP-02, ROADMAP-03
- **Was wurde umgesetzt:**
  - `nutrition-frontend/src/lib/`: Dexie-Speicher (`db.ts`), Outbox und Delta-Sync gegen `GET/POST /api/nutrition/sync` (`sync.ts`), Aktionen mit lokalen Nährwert-Snapshots (`actions.ts`, `day.ts`), Rechenlogik als Port des Backends (`nutrients.ts`), Hooks und Sprüche (`hooks.ts`, `copy.ts`). `api.ts` und `copy.ts` von `src/` nach `src/lib/` verschoben.
  - Screens: `Today.tsx` (Hero mit Restbudget und Deltas, 4 Schnellaktionen, Quick-Add, Tageszeit-Chips, „Wie gestern übernehmen“, Swipe-to-Delete mit Undo, 1–10-Bewertung mit Notiz), `FoodSheet.tsx` (Suche, Favoriten, Zuletzt verwendet, Smart Default, Brüche, Live-Restbudget), `QuickSheets.tsx` (Quick-Add, Barcode), `Recipes.tsx` (Rohzutaten + Endgewicht, Meal-Prep), `Progress.tsx` (7 Tage), `Export.tsx` (7/14/31/90 Tage, PDF/CSV/MD/JSON), `More.tsx` (Humor-Modus, Badge, Sync-Details, Logout).
  - UI-Bausteine: `ui/SyncStatusIndicator.tsx`, `ui/Mascot.tsx`, `ui/Sheet.tsx`, `ui/SwipeRow.tsx`; Design-Tokens, Phasen-Glow und 44-px-Ziele in `styles.css`; Space Grotesk selbst gehostet.
  - Tests: 5 Dateien / 32 Vitest-Tests grün (u. a. 10 ml Öl = 9,1 g, Protein-Pasta Roh → Endgewicht, Offline-Outbox mit `fake-indexeddb`, Abbruch nicht gesendeter Creates, Pull überschreibt keine ausstehenden Löschungen). Typecheck und Build sauber. Ungenutzte Dev-Abhängigkeiten `@testing-library/react` und `jsdom` entfernt.
  - Live-Abnahme mit dem Test-Account (`e2e/offline-day.mjs`, Start mit `e2e/run-offline-day.sh` auf dem Server, 390×844): Online-Eintrag, dann offline Quick-Add ×2, Suche aus dem Cache mit vorbelegter Menge, Bewertung 8 mit Notiz, Swipe + Rückgängig, Offline-Reload aus Service Worker + IndexedDB; nach Reconnect „Synchronisiert“, zweites Gerät sieht alle Einträge und die Bewertung ohne Duplikate; Overflow, Touch-Targets und `tabular-nums` auf allen 5 Tabs geprüft; keine Konsolen- oder HTTP-Fehler; Testdaten danach per UI entfernt. 39/39 PASS in zwei Läufen hintereinander.
  - `design-system-review`: Bewertungsleiste auf 2×5 umgestellt (vorher 29 px breit), Fitnesstracker-Link unter „Mehr“ als eigenes 44-px-Ziel, Badge „8/10“ ohne Lücke, Überschrift „Oft um diese Zeit“ statt „Typisch fürs Abend“, Rezepte-Empty-State mit Humor-Variante.
  - Deploy: nur Service `nutrition-frontend` aus `~/ft-nutrition-01` neu gebaut.
- **Stehengeblieben bei / Offene Punkte:**
  - Der Test-Account hat im Fitnesstracker kein Profil, daher sind Hero mit Zielwerten, Phasen-Glow und Sonnenbrillen-Maskottchen nur per Unit-Test und Code geprüft, nicht live. Für den Live-Check im Fitnesstracker ein Profil für den Test-Account anlegen.
  - Foto und Sprache sind Platzhalter, Barcode nur per Zifferneingabe: kommt mit ROADMAP-04.
  - Weiterhin offen aus ROADMAP-02: PRs #115 und #116 mergen, danach den Stack aus `~/fitnesstracker` deployen und die Worktrees entfernen; Präfix-Bonus für Eingaben wie „Haferfl“.
- **Nächster konkreter Schritt:**
  - ROADMAP-04 starten: `docs/roadmaps/roadmap_04_scanner_ki.md` lesen, Kamera-Barcode in `QuickSheets.tsx` einbauen und den Foto-Scan-Endpunkt mit Plausibilitätscheck (Skill `nutrition-math-auditor`) entwerfen.

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
