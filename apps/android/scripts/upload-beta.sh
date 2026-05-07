#!/usr/bin/env bash
set -euo pipefail

# Upload a debug APK to Firebase App Distribution for beta testers.
# Usage: ./scripts/upload-beta.sh "release notes here"

JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
CREDS="${FIREBASE_CREDS:-$HOME/Karibu Ops/karibu-prod-d4c55-firebase-adminsdk-fbsvc-5c6f5018fa.json}"
NOTES="${1:-Karibu beta build}"

cd "$(dirname "$0")/.."

JAVA_HOME="$JAVA_HOME" ./gradlew :app:appDistributionUploadDebug \
  --serviceCredentialsFile="$CREDS" \
  --groups=beta-testers \
  --releaseNotes="$NOTES"
