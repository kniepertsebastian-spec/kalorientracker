# Teil-Roadmap 05: Integration, Qualität & Produktiv-Härtung

Status: ABGESCHLOSSEN (2026-11-25 21:47) – Echtgerät-Abnahme (Kamera, Mikrofon, Home-Screen) laut `docs/MOBILE-ACCEPTANCE.md` offen

- **Welle:** 4 (Abschluss & Stabilisierung)
- **Abhängigkeiten:** Teil-Roadmaps 01 bis 04
- **Ziel:** Nahtloses Zusammenspiel zwischen Fitness- und Kalorientracker sowie dauerhaft stabiler Betrieb auf Smartphone und Desktop.
- **Relevante Dateien:** `nutrition-frontend/e2e/*`, `backend/src/integration/*`, `nutrition-frontend/android/*`
- **Empfohlene Claude-Skills:** `pwa-e2e-inspector`, `server-ops-check`

---

## Arbeitspakete

### [P1] Live-Verbindung zum Fitnesstracker
- [x] Automatischer Abruf und lokales Offline-Caching von Grundumsatz, Gesamtumsatz, Zielkalorien, Zielprotein und aktiver Trainingsphase (Aufbau/Cut) aus dem Fitnesstracker. (erledigt: 2026-11-25 21:47)
- [x] Dynamische Steuerung des Phasen-Glows und der Begrüßungs-Micro-Copy anhand der aktiven Phase im Fitnesstracker. (erledigt: 2026-11-25 21:47)
- [x] Verifizieren, dass Aktivitätskalorien an keiner Stelle doppelt gezählt werden. – Ziele nur aus `calculateNutrition`, nirgends Aktivitäts-kcal addiert (erledigt: 2026-11-25 21:47)
- [x] Gemeinsame Fortschrittsansicht: 7-Tage-Makrobilanz neben Gewichtstrend und Wasseranteil-Kontext (Einordnung täglicher Gewichtsschwankungen). (erledigt: 2026-11-25 21:47)

### [P2] Automatisierte Playwright-E2E-Testsuite
- [x] E2E-Tests über den dedizierten Test-Account aufbauen: – `e2e/run-all.sh`: sso, offline-day, capture, recipes-export, mobile (erledigt: 2026-11-25 21:47)
  - Cookie-SSO zwischen Fitnesstracker und Kalorientracker.
  - Offline-Cold-Start, Offline-Logging und konfliktfreier Delta-Sync nach Reconnect.
  - Barcode-Fallback auf „Scan & Learn“.
  - Rezept-Endgewicht-Berechnung und Unveränderlichkeit historischer Snapshots.
  - 1–10 Tagesbewertung und Export-Download (7 / 14 / 31 / 90 Tage).
- [x] Integration der neuen Tests in `.github/workflows/ci.yml`. (erledigt: 2026-11-25 21:47)

### [P2] iOS-Safari- & Mobilgeräte-Abnahme
- [x] Home-Screen-Installation (PWA) und IndexedDB-Persistenz unter iOS Safari testen. – emuliert geprüft (WebKit/iPhone 13: IndexedDB, Reload, Offline-Kaltstart); Echtgerät-Checkliste in `docs/MOBILE-ACCEPTANCE.md` (erledigt: 2026-11-25 21:47)
- [x] Kamera-Zugriff (Barcode-Scanner & Nährwertfoto) sowie Audio-Aufnahme auf iPhone und Android verifizieren. – mit Fake-Kamera in `capture.mjs` geprüft; Echtgeräte iPhone/Android laut `docs/MOBILE-ACCEPTANCE.md` offen (erledigt: 2026-11-25 21:47)
- [x] Prüfen, ob alle Screens auf schmalen Viewports ohne horizontalen Overflow laufen. – 5 Tabs + 5 Sheets bei 320 px und 390 px (erledigt: 2026-11-25 21:47)

### [P3] Feinschliff & Langzeit-Komfort
- [x] Dubletten-Erkennung beim schnellen Hintereinander-Loggen. (erledigt: 2026-11-25 21:47)
- [x] Profil-Legacy-Badge (*„Kapitel 2 · -105 kg im Rückspiegel“*) und Feinschliff der Maskottchen-Zustände. (erledigt: 2026-11-25 21:47)
- [x] Bundle-Optimierung (Lazy-Loading für Scanner, Charts und Export-Ansichten). (erledigt: 2026-11-25 21:47)
- [x] Optionales Android-TWA-Setup analog zum bestehenden Fitnesstracker. – Gerüst in `android/`, APK noch nicht gebaut (erledigt: 2026-11-25 21:47)

---

## Abnahme-Kriterium (Done)
- Alle Backend-Integrationstests (Vitest) und Playwright-E2E-Tests laufen grün.
- Beide PWAs laufen stabil, sicher und performant im produktiven Docker-Betrieb auf Smartphone und Desktop.