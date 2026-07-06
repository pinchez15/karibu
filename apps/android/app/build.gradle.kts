plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services)
    alias(libs.plugins.firebase.crashlytics)
    alias(libs.plugins.firebase.appdistribution)
}

import java.util.Properties

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

fun localProperty(name: String, defaultValue: String = ""): String {
    return localProperties.getProperty(name)?.trim()?.removeSurrounding("\"") ?: defaultValue
}

android {
    namespace = "com.karibuhealth.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.karibuhealth.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 33
        versionName = "1.0.31"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Supabase config (populated from local.properties or CI secrets)
        buildConfigField("String", "SUPABASE_URL", "\"${localProperty("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${localProperty("SUPABASE_ANON_KEY")}\"")
        buildConfigField("String", "CLERK_PUBLISHABLE_KEY", "\"${localProperty("CLERK_PUBLISHABLE_KEY")}\"")
        buildConfigField("String", "POSTHOG_API_KEY", "\"${localProperty("POSTHOG_API_KEY")}\"")
        buildConfigField("String", "POSTHOG_HOST", "\"${localProperty("POSTHOG_HOST", "https://us.i.posthog.com")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Sign the minified release with the debug key so it is installable
            // for Firebase App Distribution test launches. This is NOT a Play
            // upload key — swap in a dedicated upload keystore before any Play
            // Store release.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests {
            // android.util.Log (and other android.jar stubs) otherwise throw
            // "not mocked" RuntimeExceptions in plain JVM unit tests. Returning
            // default values lets SyncEngine et al. log freely under test.
            isReturnDefaultValues = true
        }
    }
}

configurations.all {
    resolutionStrategy.force("androidx.browser:browser:1.8.0")
}

dependencies {
    // AndroidX Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.ui.text.google.fonts)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Room
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.hilt.work)
    ksp(libs.hilt.compiler)

    // WorkManager
    implementation(libs.androidx.work.runtime.ktx)

    // Network
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)

    // Kotlin Serialization
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    // DataStore & Security
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)

    // Clerk Auth
    implementation(libs.clerk.android.api)

    // Analytics
    implementation(libs.posthog.android)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.analytics)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.androidx.room.testing)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.work.testing)
}
