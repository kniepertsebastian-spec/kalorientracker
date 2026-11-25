# Android-App (optional)

Wie beim Fitnesstracker: eine **Trusted Web Activity** (TWA), also eine schlanke App-Hülle, die die
Kalorientracker-PWA (`https://kcal.pwa-tree.de`) im Vollbild öffnet. Die PWA bleibt die Grundlage und weiter
direkt installierbar; die App zeigt immer die aktuelle Website-Version. Gebaut wird mit Bubblewrap im
Docker-Container (`Dockerfile` = dieselbe Toolchain wie `fitnesstracker/android/`).

## APK bauen

```bash
android/build.sh                                   # HOST=kcal.pwa-tree.de als Standard
VERSION_CODE=2 VERSION_NAME=1.1.0 android/build.sh # neue Version der Hülle
```

Ergebnis in `android/out/` (gitignored): `kalorientracker.apk`, `kalorientracker.aab`, `fingerprint.txt`.

Der **Signierschlüssel** entsteht beim ersten Lauf in `~/.kalorientracker-android` (`ANDROID_KEYS_DIR`).
Er gehört nicht ins Repository und muss gesichert werden: Updates einer installierten App gehen nur mit
demselben Schlüssel. Paketname: `de.pwatree.kcal` (der Fitnesstracker ist `de.pwatree.fitness`; beide Apps
können nebeneinander installiert sein und teilen sich über das Cookie-SSO die Anmeldung im Browser-Kontext
von Chrome).

## Adressleiste entfernen: assetlinks.json

Erst **nach** dem ersten Bau, wenn `fingerprint.txt` existiert:

1. `nutrition-frontend/public/.well-known/assetlinks.json` anlegen:

   ```json
   [{ "relation": ["delegate_permission/common.handle_all_urls"],
      "target": { "namespace": "android_app", "package_name": "de.pwatree.kcal",
                  "sha256_cert_fingerprints": ["<Inhalt von fingerprint.txt ohne 'SHA256: '>"] } }]
   ```

2. `nutrition-frontend` neu bauen und deployen. Caddys `file_server` setzt den Content-Type über die Endung `.json` auf `application/json`, ein eigener Header ist nicht nötig.
3. Prüfen: `curl -sI https://kcal.pwa-tree.de/.well-known/assetlinks.json` → 200, `content-type: application/json`.

Ohne diese Datei läuft die App trotzdem, zeigt aber oben eine Adressleiste. Ein Platzhalter-Fingerabdruck
wird bewusst nicht ausgeliefert.

## Grenzen

- Kamera (Barcode, Nährwertfoto) und Mikrofon (Sprache) laufen über die Web-APIs von Chrome; die App fragt
  die Berechtigungen beim ersten Gebrauch wie die Website.
- Offline kann die App genau das, was die PWA offline kann (Service Worker + IndexedDB).
