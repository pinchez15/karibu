package com.karibuhealth.learn.data.supabase

import com.karibuhealth.learn.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest

/** Deep link Supabase uses for email magic links / OTP link completion on Android. */
const val LEARN_AUTH_SCHEME = "com.karibuhealth.learn"
const val LEARN_AUTH_HOST = "login-callback"
const val LEARN_AUTH_REDIRECT_URL = "$LEARN_AUTH_SCHEME://$LEARN_AUTH_HOST"

/**
 * KaribuLearn Supabase client (separate project from EHR).
 * Credentials come from [BuildConfig] via `local.properties` — never hardcode in source.
 */
object LearnSupabase {
    val isConfigured: Boolean
        get() = BuildConfig.SUPABASE_URL.isNotBlank() &&
            BuildConfig.SUPABASE_ANON_KEY.isNotBlank() &&
            !BuildConfig.SUPABASE_URL.contains("YOUR_PROJECT")

    val client: SupabaseClient? by lazy {
        if (!isConfigured) return@lazy null
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
        ) {
            install(Auth) {
                scheme = LEARN_AUTH_SCHEME
                host = LEARN_AUTH_HOST
            }
            install(Postgrest)
        }
    }
}
