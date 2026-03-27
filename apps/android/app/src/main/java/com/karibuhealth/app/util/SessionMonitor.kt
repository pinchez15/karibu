package com.karibuhealth.app.util

import android.util.Log
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Monitors the Clerk session and refreshes the Supabase JWT before it expires.
 *
 * Supabase JWTs from Clerk have a 1-hour expiry by default.
 * This monitor refreshes the token every 45 minutes when the app is in the foreground.
 *
 * When offline, the stale token is kept -- it will be refreshed on next network reconnect.
 * Local Room operations don't require a valid JWT, only server sync does.
 */
@Singleton
class SessionMonitor @Inject constructor(
    private val clerkAuthManager: ClerkAuthManager,
    private val authTokenStore: AuthTokenStore,
    private val networkMonitor: NetworkMonitor,
) {
    companion object {
        private const val TAG = "SessionMonitor"
        private const val REFRESH_INTERVAL_MS = 45L * 60 * 1000 // 45 minutes
    }

    fun startMonitoring(scope: CoroutineScope) {
        scope.launch {
            while (isActive) {
                delay(REFRESH_INTERVAL_MS)

                if (networkMonitor.isOnline() && authTokenStore.getToken() != null) {
                    try {
                        clerkAuthManager.refreshToken()
                        Log.d(TAG, "Token refreshed successfully")
                    } catch (e: Exception) {
                        Log.w(TAG, "Token refresh failed (will retry): ${e.message}")
                    }
                } else {
                    Log.d(TAG, "Skipping token refresh (offline or not authenticated)")
                }
            }
        }
    }
}
