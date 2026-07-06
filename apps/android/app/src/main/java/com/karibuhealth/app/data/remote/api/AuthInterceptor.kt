package com.karibuhealth.app.data.remote.api

import com.karibuhealth.app.BuildConfig
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.sync.SyncMetrics
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val clerkAuthManager: Provider<ClerkAuthManager>,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        var request = buildRequest(chain, authTokenStore.getTokenBlocking())

        var response = chain.proceed(request)

        if (response.code == 401 && authTokenStore.getTokenBlocking() != null) {
            response.close()
            val refreshed = runBlocking {
                // refreshToken() now returns an honest Boolean (WP2 D3) and never
                // throws for an ordinary refresh failure; getOrDefault guards the
                // unexpected-throw path only.
                runCatching { clerkAuthManager.get().refreshToken() }.getOrDefault(false)
            }
            request = buildRequest(chain, authTokenStore.getTokenBlocking())
            response = chain.proceed(request)
            SyncMetrics.recordAuth401(retrySucceeded = response.code != 401 && refreshed)
        }

        return response
    }

    private fun buildRequest(chain: Interceptor.Chain, token: String?): okhttp3.Request {
        val originalRequest = chain.request()
        val builder = originalRequest.newBuilder()
            .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
            .apply {
                if (token != null) {
                    header("Authorization", "Bearer $token")
                } else {
                    header("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
                }
            }
            .apply {
                if (originalRequest.header("Prefer") == null) {
                    header("Prefer", "return=representation")
                }
            }

        if (originalRequest.header("Content-Type") == null &&
            originalRequest.body?.contentType() == null
        ) {
            builder.header("Content-Type", "application/json")
        }

        return builder.build()
    }

    private fun AuthTokenStore.getTokenBlocking(): String? =
        runBlocking { getToken() }
}
