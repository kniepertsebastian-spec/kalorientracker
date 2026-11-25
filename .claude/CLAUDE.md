# CLAUDE.md – Fitnesstracker & Kalorientracker

## Projektüberblick
Zwei eigenständige PWAs (React + Vite + TypeScript) mit einem gemeinsamen Backend (Node.js + Fastify + Prisma + PostgreSQL), Redis/BullMQ-Worker und Caddy als Reverse Proxy (Cookie-SSO über Subdomains).
Details: siehe `ARCHITECTURE.md` und `ROADMAP-NUTRITION.md`.

## Architektur- & Datenregeln (Single Source of Truth)
- **Fitnesstracker** ist allein führend für Körperdaten, Training, Grundumsatz, Gesamtumsatz, Zielkalorien und Zielprotein.
- **Kalorientracker** liest diese Zielwerte nur aus der API und berechnet sie **nicht** neu (keine Doppelzählung von Aktivitätskalorien).
- **Offline-First:** Beide PWAs nutzen ihre eigene lokale IndexedDB (Dexie) und synchronisieren per Delta-Sync. Kein direkter Speicherzugriff zwischen den Apps.
- **Lebensmittel-Schichten:** 1. Eigene gelernte DB (PostgreSQL) → 2. BLS 4.0 (lokal in PostgreSQL) → 3. Open Food Facts (Live + Cache) → 4. Scan & Learn (Foto via Gemini).

## Harte Fachregeln (Ernährung & KI)
- **Roh- vs. Endgewicht:** Rezepte immer erst gesamt aus Rohzutaten berechnen, dann über das tatsächliche Endgewicht auf 100 g und Portionen umrechnen.
- **Nährwert-Snapshots:** Geloggte Mahlzeiten und gespeicherte Rezepte speichern unveränderliche Nährwert-Snapshots. Spätere DB-Änderungen dürfen historische Logs nie verändern.
- **Kein Halluzinieren:** KI-Extraktionen (Foto, Sprache, Social-Media-Links) müssen fehlende Werte als `unknown` oder `estimated` markieren. Niemals Werte stillschweigend erfinden.
- **Plausibilitätscheck:** Bei Foto-Scans immer `(4*P + 4*KH + 9*F)` gegen `kcal` prüfen und Abweichungen markieren.

## Design & Tonfall („Serious Data, Playful Soul“)
- **Look:** Deep Dark Purple (`#0B0914` / `#161226`), Royal-Lila Akzent (`#8B5CF6`), Phasen-Glow (Aufbau: Lila/Amber, Cut: Violett/Cyan).
- **Zahlen:** Alle kcal-, Gramm- und Delta-Werte immer mit `tabular-nums`.
- **Copy:** Klar in der Navigation, trocken-humorvoll in Statusmeldungen, Begrüßungen und der 1–10 Tagesbewertung. Immer den globalen „Humor-Modus (An/Aus)“-Toggle respektieren.

## Entwicklung, Tests & Qualität
- Vor jedem Abschluss von Backend-Änderungen: `npm test` (Vitest) und Prisma-Validierung ausführen.
- Bei UI- oder Sync-Änderungen: relevante Playwright-E2E-Tests ausführen.
- Bestehende Fitnesstracker-Module und -Migrationen nicht brechen.

## Server- & Sicherheitsregeln
- Für Live-Tests auf dem PWA-Server ausschließlich den konfigurierten **Test-Account** verwenden.
- **Verboten ohne explizite Freigabe:** `docker compose down -v`, destruktive Prisma-Resets, Änderungen an Produktiv-Userdaten oder Committen von Secrets/`.env`-Dateien.

## Server-Zugang
- SSH-Zugriff erfolgt passwortlos über `ssh basti@84.247.167.113` (Projektpfad auf dem Server: `~/kalorientracker`).

## Session-Start & Fortschrittsdokumentation (Pflicht)
- **Beim Start jeder Session:** Zuerst die obersten Einträge (neueste Timestamps) in `docs/PROGRESS-LOG.md` lesen, um zu erkennen, welche Roadmaps abgeschlossen sind und wo stehengeblieben wurde.
- **Nach jedem abgeschlossenen Arbeitspaket / vor Session-Ende:** Den Skill `roadmap-progress-tracker` ausführen, den echten System-Timestamp (`date '+%Y-%m-%d %H:%M %Z'`) holen, erledigte Punkte in der jeweiligen `ROADMAP-XX-*.md` abhaken und einen neuen Eintrag ganz oben in `docs/PROGRESS-LOG.md` ergänzen.
