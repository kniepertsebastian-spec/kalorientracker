# Teil-Roadmap 05: Integration, Qualität & Produktiv-Härtung

- **Welle:** 4 (Abschluss & Stabilisierung)
- **Abhängigkeiten:** Teil-Roadmaps 01 bis 04
- **Ziel:** Nahtloses Zusammenspiel zwischen Fitness- und Kalorientracker sowie dauerhaft stabiler Betrieb auf Smartphone und Desktop.
- **Relevante Dateien:** `nutrition-frontend/e2e/*`, `backend/src/integration/*`, `nutrition-frontend/android/*`
- **Empfohlene Claude-Skills:** `pwa-e2e-inspector`, `server-ops-check`

---

## Arbeitspakete

### [P1] Live-Verbindung zum Fitnesstracker
- [ ] Automatischer Abruf und lokales Offline-Caching von Grundumsatz, Gesamtumsatz, Zielkalorien, Zielprotein und aktiver Trainingsphase (Aufbau/Cut) aus dem Fitnesstracker.
- [ ] Dynamische Steuerung des Phasen-Glows und der Begrüßungs-Micro-Copy anhand der aktiven Phase im Fitnesstracker.
- [ ] Verifizieren, dass Aktivitätskalorien an keiner Stelle doppelt gezählt werden.
- [ ] Gemeinsame Fortschrittsansicht: 7-Tage-Makrobilanz neben Gewichtstrend und Wasseranteil-Kontext (Einordnung täglicher Gewichtsschwankungen).

### [P2] Automatisierte Playwright-E2E-Testsuite
- [ ] E2E-Tests über den dedizierten Test-Account aufbauen:
  - Cookie-SSO zwischen Fitnesstracker und Kalorientracker.
  - Offline-Cold-Start, Offline-Logging und konfliktfreier Delta-Sync nach Reconnect.
  - Barcode-Fallback auf „Scan & Learn“.
  - Rezept-Endgewicht-Berechnung und Unveränderlichkeit historischer Snapshots.
  - 1–10 Tagesbewertung und Export-Download (7 / 14 / 31 / 90 Tage).
- [ ] Integration der neuen Tests in `.github/workflows/ci.yml`.

### [P2] iOS-Safari- & Mobilgeräte-Abnahme
- [ ] Home-Screen-Installation (PWA) und IndexedDB-Persistenz unter iOS Safari testen.
- [ ] Kamera-Zugriff (Barcode-Scanner & Nährwertfoto) sowie Audio-Aufnahme auf iPhone und Android verifizieren.
- [ ] Prüfen, ob alle Screens auf schmalen Viewports ohne horizontalen Overflow laufen.

### [P3] Feinschliff & Langzeit-Komfort
- [ ] Dubletten-Erkennung beim schnellen Hintereinander-Loggen.
- [ ] Profil-Legacy-Badge (*„Kapitel 2 · -105 kg im Rückspiegel“*) und Feinschliff der Maskottchen-Zustände.
- [ ] Bundle-Optimierung (Lazy-Loading für Scanner, Charts und Export-Ansichten).
- [ ] Optionales Android-TWA-Setup analog zum bestehenden Fitnesstracker.

---

## Abnahme-Kriterium (Done)
- Alle Backend-Integrationstests (Vitest) und Playwright-E2E-Tests laufen grün.
- Beide PWAs laufen stabil, sicher und performant im produktiven Docker-Betrieb auf Smartphone und Desktop.