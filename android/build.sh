#!/usr/bin/env bash
# Builds the optional Android app for the Kalorientracker (a Trusted Web Activity around the PWA),
# the same way as the Fitnesstracker's android/. Needs Docker, nothing else.
#
#   android/build.sh                                  # host kcal.pwa-tree.de (override: HOST=…)
#   VERSION_CODE=2 VERSION_NAME=1.1.0 android/build.sh
#
# Results in android/out/: kalorientracker.apk, kalorientracker.aab and fingerprint.txt. The signing
# key lives in ~/.kalorientracker-android (override: ANDROID_KEYS_DIR): back it up, never commit it.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${HOST:-kcal.pwa-tree.de}"
KEYS_DIR="${ANDROID_KEYS_DIR:-$HOME/.kalorientracker-android}"
OUT_DIR="${ANDROID_OUT_DIR:-$PWD/out}"
mkdir -p "$KEYS_DIR" "$OUT_DIR"
chmod 700 "$KEYS_DIR"

docker build -t kalorientracker-android-build .
docker run --rm \
  -e HOST="$HOST" -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" -e VERSION_NAME="${VERSION_NAME:-1.0.0}" -e VERSION_CODE="${VERSION_CODE:-1}" \
  -v "$KEYS_DIR:/keys" -v "$OUT_DIR:/out" -v "$PWD:/src:ro" \
  kalorientracker-android-build sh /src/inside.sh
