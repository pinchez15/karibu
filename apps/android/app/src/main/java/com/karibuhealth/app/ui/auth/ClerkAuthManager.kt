package com.karibuhealth.app.ui.auth

import android.content.Context
import android.util.Log
import com.clerk.api.Clerk
import com.clerk.api.network.model.error.ClerkErrorResponse
import com.clerk.api.network.model.token.TokenResource
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.session.GetTokenOptions
import com.clerk.api.session.fetchToken
import com.clerk.api.signin.SignIn
import com.karibuhealth.app.BuildConfig
import com.karibuhealth.app.data.repository.AuthManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

sealed interface ClerkAuthState {
    data object Loading : ClerkAuthState
    data object SignedOut : ClerkAuthState
    data class SignedIn(val userId: String) : ClerkAuthState
    data class Error(val message: String) : ClerkAuthState
}

/**
 * Clerk owns the native sign-in UX and session persistence. This manager bridges
 * that session into the app's own AuthManager by fetching a Supabase JWT from
 * the configured Clerk template and caching linked staff data locally.
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
    private var observeJob: Job? = null

    fun initialize() {
        if (BuildConfig.CLERK_PUBLISHABLE_KEY.isBlank()) {
            _state.value = ClerkAuthState.Error("Missing CLERK_PUBLISHABLE_KEY in local.properties")
            return
        }

        try {
            Clerk.initialize(context, publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY)
            Log.d(TAG, "Clerk SDK initialized")
            observeUserSession()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize Clerk", e)
            _state.value = ClerkAuthState.Error("Failed to initialize auth: ${e.message}")
        }
    }

    fun retryInitialize() {
        initialize()
    }

    private fun observeUserSession() {
        observeJob?.cancel()
        observeJob = scope.launch {
            Clerk.userFlow.collectLatest { user ->
                try {
                    if (user == null) {
                        authManager.signOut()
                        _state.value = ClerkAuthState.SignedOut
                    } else {
                        handleActiveSession(user.id)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error syncing Clerk session", e)
                    _state.value = ClerkAuthState.Error(e.message ?: "Auth error")
                }
            }
        }
    }

    private suspend fun handleActiveSession(userId: String) {
        Log.d(TAG, "Active session for user: $userId")

        val token = tokenFrom(
            Clerk.session?.fetchToken(
                GetTokenOptions(template = AuthManager.SUPABASE_JWT_TEMPLATE)
            )
        )

        if (token.isNullOrBlank()) {
            Log.w(TAG, "Failed to get Supabase token from Clerk auth state")
            _state.value = ClerkAuthState.Error("Failed to get auth token")
            return
        }

        authManager.onClerkSignIn(userId, token)
        _state.value = ClerkAuthState.SignedIn(userId)
    }

    suspend fun signInWithPassword(email: String, password: String) {
        val result = SignIn.create(
            SignIn.CreateParams.Strategy.Password(
                identifier = email.trim(),
                password = password,
            )
        )

        when (result) {
            is ClerkResult.Success -> {
                val sessionId = result.value.createdSessionId
                if (!sessionId.isNullOrBlank()) {
                    val active = Clerk.setActive(sessionId, null)
                    if (active !is ClerkResult.Success) {
                        throw IllegalStateException("Signed in, but failed to activate session")
                    }
                }
            }
            is ClerkResult.Failure -> {
                throw result.throwable ?: IllegalStateException("Invalid email or password")
            }
        }
    }

    suspend fun refreshToken() {
        try {
            val token = tokenFrom(
                Clerk.session?.fetchToken(
                    GetTokenOptions(
                        template = AuthManager.SUPABASE_JWT_TEMPLATE,
                        skipCache = true,
                    )
                )
            )
            if (!token.isNullOrBlank()) {
                authManager.refreshToken(token)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Token refresh failed", e)
        }
    }

    suspend fun signOut() {
        try {
            Clerk.signOut()
            authManager.signOut()
            _state.value = ClerkAuthState.SignedOut
        } catch (e: Exception) {
            Log.e(TAG, "Sign out failed", e)
            authManager.signOut()
            _state.value = ClerkAuthState.SignedOut
        }
    }

    private fun tokenFrom(
        result: ClerkResult<TokenResource, ClerkErrorResponse>?,
    ): String? = when (result) {
        is ClerkResult.Success -> result.value.jwt
        is ClerkResult.Failure -> {
            Log.w(TAG, "Token request failed: ${result.throwable?.message}")
            null
        }
        null -> null
    }
}
