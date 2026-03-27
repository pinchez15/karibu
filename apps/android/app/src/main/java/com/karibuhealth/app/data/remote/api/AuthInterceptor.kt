package com.karibuhealth.app.data.remote.api

import com.karibuhealth.app.BuildConfig
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val authTokenStore: AuthTokenStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        val token = runBlocking { authTokenStore.getToken() }

        val request = originalRequest.newBuilder()
            .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .apply {
                if (token != null) {
                    header("Authorization", "Bearer $token")
                } else {
                    header("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
                }
            }
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .build()

        return chain.proceed(request)
    }
}
