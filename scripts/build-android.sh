#!/usr/bin/env bash
# Builds the signed TIGON IOT Android app (APK) from frontend/ (the web app must already be built into frontend/dist).
# Usage: scripts/build-android.sh [output.apk]
# Version code = minutes since 2026-01-01 (always increases, so every build installs as an update).
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export APP_VERSION_CODE="${APP_VERSION_CODE:-$(( ($(date -u +%s) - 1767225600) / 60 ))}"
export APP_VERSION_NAME="${APP_VERSION_NAME:-2.0.${APP_VERSION_CODE}}"
npx cap sync android
if [ -n "${GOOGLE_SERVICES_JSON:-}" ]; then
  printf '%s' "$GOOGLE_SERVICES_JSON" > android/app/google-services.json
fi
(cd android && ./gradlew assembleRelease --no-daemon)
OUT="${1:-android/app/build/outputs/apk/release/tigon-iot.apk}"
mkdir -p "$(dirname "$OUT")"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "Built $OUT (version $APP_VERSION_NAME, code $APP_VERSION_CODE)"
printf '{"versionCode":%s,"versionName":"%s","builtAt":"%s","url":"/downloads/tigon-iot.apk"}\n' \
  "$APP_VERSION_CODE" "$APP_VERSION_NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$(dirname "$OUT")/version.json"
