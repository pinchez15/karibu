# Karibu Learn Android

Standalone Android app for Karibu Learn — free clinical CME with simulated cases.

Karibu Learn is **not** Karibu EHR. It is a separate install, separate auth (Supabase Auth), and separate user database (Learn Supabase). The EHR app does not open Learn, and Learn does not open the EHR. Both apps live in this monorepo so Learn can mirror EHR chart UX for pre-onboarding.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/karibu-learn/product-boundary.md`](../../docs/karibu-learn/product-boundary.md).

## Build

Create `local.properties` with your SDK path (copy from `apps/android/local.properties` if needed):

```properties
sdk.dir=/path/to/Android/sdk
LEARN_SUPABASE_URL=https://your-learn-project.supabase.co
LEARN_SUPABASE_ANON_KEY=your-learn-anon-key
```

From the repository root:

```sh
pnpm learn-android:build
pnpm learn-android:test
```

The build reuses the Android Gradle wrapper from `apps/android`. Debug APK output:

`apps/learn-android/build/outputs/apk/debug/KaribuLearnAndroid-debug.apk`

## Firebase App Distribution (test builds)

1. In [Firebase Console](https://console.firebase.google.com/) (same project as EHR is fine: `karibu-prod-d4c55`), register an Android app with package **`com.karibuhealth.learn`**.
2. Download `google-services.json` and place it at `apps/learn-android/google-services.json` (replace the placeholder if present).
3. Enable **App Distribution** and add tester groups.
4. Set a service account JSON path for uploads:

   ```sh
   export FIREBASE_CREDS=/path/to/firebase-service-account.json
   ```

5. Upload a debug build to testers:

   ```sh
   pnpm learn-android:upload
   ```

   Or run `./scripts/upload-beta.sh` from this directory.

## Status

- Learn UI ported from transitional EHR code into this module (no Hilt; plain ViewModel factory).
- Bundled pack: **3 cases** in `core-opd.kpack` (1 fully walkable: fever-headache).
- HC3 generated corpus (`content/learn/generated/hc3-core-draft-v0.1.0/`) is **not** bundled yet — pipeline export format differs from runtime `.kpack`; see `docs/karibu-learn/content-pipeline.md`.
- Supabase Auth wiring is scaffolded (`BuildConfig` fields); sign-in screens are not shipped in v0.1.0.
