# Karibu Learn Android

This is the standalone Android application shell for Karibu Learn.

The module is intentionally minimal. It configures Kotlin, Jetpack Compose, Clerk, and Supabase-facing network dependencies, but does not implement screens, clinical workflows, learning cases, or business logic.

## Build

From the repository root:

```sh
pnpm learn-android:build
```

The build reuses the existing Android Gradle wrapper from `apps/android`.

