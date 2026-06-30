#!/usr/bin/env bash
set -euo pipefail

# Upload Karibu Learn debug APK to Firebase App Distribution.
# Usage: ./scripts/upload-beta.sh "release notes"
#
# Prerequisites:
#   1. Register Android app com.karibuhealth.learn in Firebase project karibu-learn.
#   2. google-services.json in apps/learn-android/ (gitignored).
#   3. Service account JSON at ~/Karibu Ops/karibu-learn-firebase-adminsdk.json
#
# Tester assignment via CLI often 404s on Spark until the tester exists for THIS
# app in the console. Default: upload only — distribute from Firebase → Releases.

JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
CREDS="${LEARN_FIREBASE_CREDS:-${FIREBASE_CREDS:-$HOME/Karibu Ops/karibu-learn-firebase-adminsdk.json}}"
NOTES="${1:-Karibu Learn v0.1.2 — downloadable chapter packs, new icon, corrections}"
DIST_GROUP="${LEARN_FIREBASE_GROUPS:-}"
DIST_TESTER="${LEARN_FIREBASE_TESTERS:-}"

cd "$(dirname "$0")/.."

if [[ ! -f google-services.json ]]; then
  echo "Missing google-services.json — copy from Firebase Console (Android app: com.karibuhealth.learn)." >&2
  exit 1
fi

if [[ -z "$CREDS" || ! -f "$CREDS" ]]; then
  echo "Missing Firebase service account for karibu-learn." >&2
  echo "Save key as: $HOME/Karibu Ops/karibu-learn-firebase-adminsdk.json" >&2
  exit 1
fi

DIST_ARGS=(--serviceCredentialsFile="$CREDS" --releaseNotes="$NOTES")
if [[ -n "$DIST_GROUP" ]]; then
  DIST_ARGS+=(--groups="$DIST_GROUP")
  echo "Will assign group: $DIST_GROUP"
fi
if [[ -n "$DIST_TESTER" ]]; then
  DIST_ARGS+=(--testers="$DIST_TESTER")
  echo "Will assign testers: $DIST_TESTER"
fi
if [[ -z "$DIST_GROUP" && -z "$DIST_TESTER" ]]; then
  echo "Upload only (no CLI tester assignment). Distribute from Firebase Console → Releases."
fi

# Gradle App Distribution plugin reads GROUPS/TESTERS from the environment — clear them.
unset GROUPS TESTERS FIREBASE_GROUPS FIREBASE_TESTERS 2>/dev/null || true

set +e
OUTPUT="$(
  JAVA_HOME="$JAVA_HOME" ../android/gradlew -p . assembleDebug appDistributionUploadDebug \
    "${DIST_ARGS[@]}" 2>&1
)"
CODE=$?
set -e

echo "$OUTPUT"

if echo "$OUTPUT" | grep -q "Uploaded APK successfully"; then
  echo "$OUTPUT" | grep -E "View this release|Share this release" || true
  if echo "$OUTPUT" | grep -q "problem adding testers/groups"; then
    echo ""
    echo "APK uploaded successfully. CLI could not assign testers (404 — normal on Spark)."
    echo "Open the release link above → Distribute → select nate@cappawork.com"
    exit 0
  fi
  if echo "$OUTPUT" | grep -q "App Distribution upload finished successfully"; then
    echo ""
    echo "Upload complete."
    exit 0
  fi
fi

exit "$CODE"
