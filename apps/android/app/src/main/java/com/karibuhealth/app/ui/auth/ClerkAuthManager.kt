package com.karibuhealth.app.ui.auth

import android.content.Context
import android.util.Log
import com.clerk.android.Clerk
import com.clerk.android.models.Session
import com.karibuhealth.app.BuildConfig
import com.karibuhealth.app.data.repository.AuthManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

sealed interface ClerkAuthState {
    data object Loading : ClerkAuthState
    data object SignedOut : ClerkAuthState
    data class SignedIn(val userId: String, val sessionId: String) : ClerkAuthState
    data class Error(val message: String) : ClerkAuthState
}

/**
 * Bridges Clerk Android SDK with our AuthManager.
 *
 * Clerk SDK lifecycle:
 * 1. Initialize with publishable key in Application.onCreate
 * 2. Observe session state changes
 * 3. On active session, fetch Supabase JWT via getToken(template="supabase")
 * 4. Pass JWT to AuthManager for storage and staff record lookup
 * 5. On session end, clear auth state
 *
 * The Clerk SDK handles:
 * - OAuth (Google, Apple, etc.)
 * - Email + password
 * - Session persistence across app restarts
 * - Automatic token refresh
 */
@Singleton
class ClerkAuthManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val authManager: AuthManager,
) {
    companion object {
        private const val TAG = "ClerkAuthManager"
    }

    private val _state = MutableStateFlow<ClerkAuthState>(ClerkAuthState.Loading)
    val state: StateFlow<ClerkAuthState> = _state.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.Main)

    fun initialize() {
        try {
            Clerk.configure(context, publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY)
            Log.d(TAG, "Clerk SDK initialized")
            observeSession()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Clerk", e)
            _state.value = ClerkAuthState.Error("Failed to initialize auth: ${e.message}")
        }
    }

    private fun observeSession() {
        scope.launch {
            try {
                val client = Clerk.getClient()
                if (client.session != null) {
                    handleActiveSession(client.session!!)
                } else {
                    _state.value = ClerkAuthState.SignedOut
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking session", e)
                _state.value = ClerkAuthState.SignedOut
            }
        }
    }

    suspend fun handleActiveSession(session: Session) {
        try {
            val userId = session.userId
            Log.d(TAG, "Active session for user: $userId")

            // Get Supabase-formatted JWT from Clerk
            val token = session.getToken(template = AuthManager.SUPABASE_JWT_TEMPLATE)

            if (token != null) {
                authManager.onClerkSignIn(userId, token)
                _state.value = ClerkAuthState.SignedIn(userId, session.id)
            } else {
                Log.w(TAG, "Failed to get Supabase token from Clerk session")
                _state.value = ClerkAuthState.Error("Failed to get auth token")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling session", e)
            _state.value = ClerkAuthState.Error(e.message ?: "Auth error")
        }
    }

    suspend fun refreshToken() {
        try {
            val client = Clerk.getClient()
            val session = client.session ?: return
            val token = session.getToken(template = AuthManager.SUPABASE_JWT_TEMPLATE)
            if (token != null) {
                authManager.refreshToken(token)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Token refresh failed", e)
        }
    }

    suspend fun signOut() {
        try {
            Clerk.getClient().signOut()
            authManager.signOut()
            _state.value = ClerkAuthState.SignedOut
        } catch (e: Exception) {
            Log.e(TAG, "Sign out failed", e)
            // Force local sign out even if Clerk fails
            authManager.signOut()
            _state.value = ClerkAuthState.SignedOut
        }
    }
}
