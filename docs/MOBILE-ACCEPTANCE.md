# Mobile-Abnahme (iOS Safari & Android)

Was ein Browser emulieren kann, prüft `e2e/mobile.mjs` automatisch (WebKit mit iPhone-Profil, 320 px und
390 px, alle Tabs und Erfassungs-Sheets). Kamera, Mikrofon und die Home-Screen-Installation brauchen echte
Geräte: dafür diese Checkliste. Immer mit dem **Test-Account** prüfen.

## Automatisch (bei jedem Live-E2E-Lauf)

| Prüfung | Skript | Stand 2026-11-25 |
|---|---|---|
| Login, Sync, IndexedDB angelegt, Eintrag überlebt Reload (WebKit/iPhone 13) | `mobile.mjs` | PASS |
| Offline-Kaltstart aus Service Worker + IndexedDB (WebKit) | `mobile.mjs` | PASS |
| Kein horizontaler Overflow: 5 Tabs + 5 Sheets bei 390 px (WebKit) und 320 px (Chromium) | `mobile.mjs` | PASS (nach Fix: Grid-Spalten `minmax(0, 1fr)` in Sheets) |
| Touch-Targets ≥ 44 px, `tabular-nums` auf allen Tabs | `offline-day.mjs` | PASS |
| Kamera mit Fake-Gerät: Barcode → OFF → Scan & Learn | `capture.mjs` | PASS |

## Auf echten Geräten (manuell)

Ergebnis je Zeile mit Datum, Gerät und OS-Version eintragen.

### iPhone (Safari)

- [ ] `kcal.pwa-tree.de` öffnen → Teilen → „Zum Home-Bildschirm“: Icon und Name „Kalorientracker“, Start ohne Safari-Leiste.
- [ ] Aus dem Home-Screen anmelden (SSO): danach `fitness.pwa-tree.de` in Safari ohne neue Anmeldung. Hinweis: Home-Screen-Apps haben unter iOS einen eigenen Cookie-Speicher, die erste Anmeldung in der installierten App ist also normal.
- [ ] Eintrag anlegen, App komplett schließen, Flugmodus an, App öffnen: Eintrag da, Status „Offline“.
- [ ] Flugmodus aus: Status wechselt auf „Synchronisiert“, Eintrag auf zweitem Gerät sichtbar.
- [ ] Nach 7+ Tagen ohne Öffnen: Daten noch da (iOS löscht Speicher nicht installierter Seiten nach 7 Tagen; als Home-Screen-App gilt das nicht).
- [ ] Barcode: Kamera-Berechtigung erscheint, Rückkamera wird genutzt, ein EAN wird erkannt.
- [ ] Nährwertfoto (Scan & Learn): Kamera oder Mediathek, Vorschau, Prüf-Schritt mit markierten Feldern.
- [ ] Sprache: Mikrofon-Berechtigung, Aufnahme startet/stoppt, Transkript-Prüfung erscheint.
- [ ] Rezept per „Teilen“ aus Instagram/Safari: iOS kennt kein Web-Share-Target; Link kopieren → Rezepte → Importieren.
- [ ] Tastatur verdeckt in Sheets nicht den „Eintragen“-Button (iPhone SE und Pro Max).
- [ ] Shortcut per Kurzbefehl: Kurzbefehle-App → neuer Kurzbefehl → „URL öffnen“ mit `https://kcal.pwa-tree.de/#snack` (bzw. `#sprache`) → zum Home-Bildschirm, auf die Action-Taste oder auf „Auf Rückseite tippen“ legen. Öffnet in Safari (eigene Anmeldung, Daten kommen per Sync); iOS kennt keine App-Shortcuts für Web-Apps.

### Android (Chrome)

- [ ] Installieren über das Chrome-Menü bzw. den Installations-Hinweis; Start im Standalone-Modus.
- [ ] Teilen aus Instagram/YouTube → „Kalorientracker“ als Ziel → Import-Sheet mit dem Link.
- [ ] Langer Druck aufs App-Icon: „Snack“ öffnet das Textfeld (Mahlzeit = Snack, Tastatur offen), „Sprache“ die Aufnahme.
- [ ] Barcode (Rückkamera), Nährwertfoto, Sprachaufnahme wie oben.
- [ ] Offline-Kaltstart und Sync wie oben.
- [ ] Optional: TWA-App aus `android/` (siehe `android/README.md`) – ohne `assetlinks.json` mit Adressleiste.

## Bekannte Grenzen

- Kamera und Mikrofon nur über HTTPS und nach Nutzer-Geste (Button), nie automatisch beim Laden.
- iOS: `navigator.storage.persist()` wird ignoriert; Schutz vor Löschung gibt es nur als Home-Screen-App.
