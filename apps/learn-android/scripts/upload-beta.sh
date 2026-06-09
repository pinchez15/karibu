#!/usr/bin/env bash
set -euo pipefail

# Upload Karibu Learn debug APK to Firebase App Distribution.
# Usage: ./scripts/upload-beta.sh "release notes"
#
# Prerequisites:
#   1. Register Android app com.karibuhealth.learn in your Firebase project.
#   2. Download google-services.json into apps/learn-android/ (see google-services.json.example).
#   3. Set FIREBASE_CREDS to a service account JSON with App Distribution permission.

JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
CREDS="${FIREBASE_CREDS:-}"
NOTES="${1:-Karibu Learn test build}"
GROUPS="${FIREBASE_GROUPS:-beta-testers}"

cd "$(dirname "$0")/.."

if [[ ! -f google-services.json ]]; then
  echo "Missing google-services.json — copy from Firebase Console (Android app: com.karibuhealth.learn)." >&2
  echo "See google-services.json.example" >&2
  exit 1
fi

if [[ -z "$CREDS" || ! -f "$CREDS" ]]; then
  echo "Set FIREBASE_CREDS to your Firebase service account JSON path." >&2
  exit 1
fi

JAVA_HOME="$JAVA_HOME" ../android/gradlew -p . assembleDebug appDistributionUploadDebug \
  --serviceCredentialsFile="$CREDS" \
  --groups="$GROUPS" \
  --releaseNotes="$NOTES"

echo "Upload complete. Check Firebase Console → App Distribution."
