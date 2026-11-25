---
name: pwa-e2e-inspector
description: Prüft die laufende Fitnesstracker- oder Kalorientracker-PWA per Playwright-Login (Test-Account) auf Mobile-Layout, Konsolenfehler, Offline-Funktionalität und Delta-Sync. Verwenden nach UI-, PWA- oder Sync-Änderungen.
---

# PWA E2E Inspector

## Ziel
Verifiziere Änderungen an der laufenden PWA realitätsnah im Mobile-Viewport, bevor ein Task als erledigt markiert wird.

## Sicherheitsregeln
- Verwende **ausschließlich** den dedizierten Test-Account aus den lokalen Umgebungsvariablen (`TEST_PWA_EMAIL`, `TEST_PWA_PASSWORD`, `TEST_PWA_URL`).
- Logge dich **niemals** in Produktiv-Accounts mit echten Benutzerdaten ein.
- Gib Passwörter, Cookies oder JWTs niemals im Output oder in Logs aus.

## Prüf-Ablauf
1. **Login & Kaltstart**
   - Öffne die PWA im Mobile-Viewport (`390x844`, iPhone-Größe) und logge dich mit dem Test-Account ein.
   - Prüfe, ob das Cookie-SSO sauber greift und keine `401`/`403`-Schleifen auftreten.
2. **Konsole & Netzwerk**
   - Sammle alle `console.error`, unbehandelte Exceptions (`pageerror`) und fehlgeschlagene API-Requests (`>= 400`).
3. **Offline- & Sync-Check**
   - Schalte den Browserkontext auf `offline`.
   - Erstelle oder ändere einen Testeintrag (z. B. Mahlzeit oder Tagesbewertung 1–10) und prüfe, ob er sofort lokal (IndexedDB/Dexie) gespeichert und angezeigt wird.
   - Schalte wieder auf `online` und verifiziere, dass der Sync-Indikator wieder auf „Synchronisiert“ wechselt und die Daten einen Reload überleben.
4. **Visuelle Kontrolle**
   - Prüfe auf horizontalen Overflow (`scrollWidth > clientWidth`), abgeschnittene Texte und ausreichend große Touch-Targets (`>= 44x44px`).
   - Speichere bei UI-Änderungen einen Screenshot zur Kontrolle.

## Ausgabeformat
- **Status:** PASS / FAIL
- **Geprüfte Flows:** Liste der getesteten Schritte
- **Gefundene Fehler:** Konkrete Konsolen-, Netzwerk- oder Layout-Fehler inkl. Dateiverweis
- **Aufräumen:** Lösche angelegte Test-Einträge im Test-Account wieder, sofern sie den Zustand dauerhaft verschmutzen.
