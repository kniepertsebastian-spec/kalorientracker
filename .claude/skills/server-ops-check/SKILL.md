---
name: server-ops-check
description: Prüft auf dem Zielserver den Zustand von Docker-Containern, Logs, Healthchecks, Redis/BullMQ-Worker und Caddy-Routing. Verwenden nach Deployments oder bei Server-/Verbindungsproblemen.
---

# Server Ops Check

## Ziel
Schnelle, sichere Diagnose und Verifikation der Docker-Infrastruktur (Fitnesstracker-PWA, Kalorientracker-PWA, Shared API, Worker, PostgreSQL, Redis, Caddy).

## Strikte Sicherheitsgrenzen
- **Erlaubt:** Container-Status lesen, Logs prüfen, Healthchecks aufrufen, `docker compose build` und gezieltes `docker compose up -d <service>` nach Code-Änderungen.
- **Streng verboten ohne explizite Nutzer-Freigabe:**
  - `docker compose down -v` oder Löschen von Volumes
  - Manuelle Eingriffe in Produktiv-Datenbanken (`DELETE`/`UPDATE`/`DROP`)
  - Änderungen an TLS-Zertifikaten oder Ausgabe von `.env`-Secrets im Chat.

## Diagnose-Checkliste
1. **Container-Status:** `docker compose ps` prüfen – laufen alle Services (`healthy` / `Up`), gibt es Restart-Loops?
2. **API & Datenbank:** Health-Endpunkt der Shared API prüfen und Logs der letzten 100 Zeilen auf Fehler/Timeouts scannen.
3. **Worker & Queue:** Prüfen, ob Redis erreichbar ist und der BullMQ-Worker (`yt-dlp` / KI-Jobs) ohne Crash läuft.
4. **Caddy Reverse Proxy:** Prüfen, ob Routing für beide Subdomains (Fitness & Kalorien) sowie API-Pfad und Cookie-Domain sauber funktionieren (`caddy validate` bei Caddyfile-Änderungen).
5. **Ressourcen:** Kurz RAM- und Festplattenauslastung (`df -h`, `docker stats --no-stream`) prüfen – insbesondere Speicherverbrauch durch Media-Uploads.

## Ausgabeformat
Kurze Übersichtstabelle (`Service | Status | Auffälligkeiten`) plus konkrete nächste Handlungsempfehlung bei Fehlern.
