#!/usr/bin/env bash
# Builds the signed TIGON IOT Android app (APK) from frontend/ (the web app must already be built into frontend/dist).
# Usage: scripts/build-android.sh [output.apk]
#
# Signing (required — the build FAILS without it; a public APK is never unsigned or debug-signed):
#   CI:    ANDROID_KEYSTORE_BASE64 + ANDROID_KEYSTORE_PASSWORD (+ optional ANDROID_KEY_ALIAS, default "tigon")
#          repository secrets. The keystore is decoded into a temp file that is deleted when the script ends.
#   Local: TIGON_KEYSTORE_PATH + TIGON_STORE_PASSWORD (+ TIGON_KEY_ALIAS / TIGON_KEY_PASSWORD).
#
# Version code = 3,000,000 + minutes since 2026-01-01 (always increases, so every build installs as an update).
# Builds before October 2026 used plain minutes (< 3,000,000) and were signed with the OLD key, which was retired
# because it had been committed to git. Android can't update an app signed with a different key, so phones with an
# app below MIN_VERSION_CODE must uninstall it once and install the new one (version.json "requiresReinstall").
set -euo pipefail
cd "$(dirname "$0")/../frontend"

NEW_KEY_BASE=3000000          # first version code signed with the 2026 key
MIN_VERSION_CODE=$NEW_KEY_BASE # installed apps below this need a one-time reinstall

export APP_VERSION_CODE="${APP_VERSION_CODE:-$(( NEW_KEY_BASE + ($(date -u +%s) - 1767225600) / 60 ))}"
export APP_VERSION_NAME="${APP_VERSION_NAME:-3.0.$(( APP_VERSION_CODE - NEW_KEY_BASE ))}"
if [ "$APP_VERSION_CODE" -lt "$MIN_VERSION_CODE" ]; then
  echo "::error::APP_VERSION_CODE ($APP_VERSION_CODE) must be >= $MIN_VERSION_CODE (builds signed with the new key)." >&2
  exit 1
fi

# --- Release signing key -------------------------------------------------------------------------------------------
if [ -z "${TIGON_KEYSTORE_PATH:-}" ] && [ -n "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  KS_TMP="$(mktemp -d)"
  trap 'rm -rf "$KS_TMP"' EXIT
  printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$KS_TMP/release.keystore"
  export TIGON_KEYSTORE_PATH="$KS_TMP/release.keystore"
  export TIGON_STORE_PASSWORD="${ANDROID_KEYSTORE_PASSWORD:-}"
  export TIGON_KEY_ALIAS="${ANDROID_KEY_ALIAS:-tigon}"
fi
if [ -z "${TIGON_KEYSTORE_PATH:-}" ] || [ ! -s "${TIGON_KEYSTORE_PATH}" ] || [ -z "${TIGON_STORE_PASSWORD:-}" ]; then
  echo "::error::Android release signing key is missing. Add the repository secrets ANDROID_KEYSTORE_BASE64 and" \
       "ANDROID_KEYSTORE_PASSWORD (and ANDROID_KEY_ALIAS) - see docs/RUNBOOK.md 'Android signing key'." >&2
  exit 1
fi
export TIGON_KEY_ALIAS="${TIGON_KEY_ALIAS:-tigon}"

npx cap sync android
if [ -n "${GOOGLE_SERVICES_JSON:-}" ]; then
  printf '%s' "$GOOGLE_SERVICES_JSON" > android/app/google-services.json
fi
(cd android && ./gradlew assembleRelease --no-daemon)
OUT="${1:-android/app/build/outputs/apk/release/tigon-iot.apk}"
mkdir -p "$(dirname "$OUT")"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "Built $OUT (version $APP_VERSION_NAME, code $APP_VERSION_CODE)"
printf '{"versionCode":%s,"versionName":"%s","builtAt":"%s","url":"/downloads/tigon-iot.apk","minVersionCode":%s,"requiresReinstall":true}\n' \
  "$APP_VERSION_CODE" "$APP_VERSION_NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MIN_VERSION_CODE" > "$(dirname "$OUT")/version.json"
