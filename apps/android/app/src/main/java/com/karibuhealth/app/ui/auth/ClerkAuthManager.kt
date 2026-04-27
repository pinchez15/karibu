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
import com.clerk.api.signin.attemptFirstFactor
import com.clerk.api.signin.attemptSecondFactor
import com.clerk.api.signin.prepareSecondFactor
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
    data class NeedsCode(val destinationHint: String) : ClerkAuthState
    data class SignedIn(val userId: String) : ClerkAuthState
    data class Error(val message: String) : ClerkAuthState
}

private enum class PendingCodeStep {
    SECOND_FACTOR_EMAIL,
    SECOND_FACTOR_PHONE,
}

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
    private var pendingSignIn: SignIn? = null
    private var pendingCodeStep: PendingCodeStep? = null

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

    fun resetPendingSignIn() {
        pendingSignIn = null
        pendingCodeStep = null
        _state.value = ClerkAuthState.SignedOut
    }

    private fun observeUserSession() {
        observeJob?.cancel()
        observeJob = scope.launch {
            Clerk.userFlow.collectLatest { user ->
                try {
                    if (user == null) {
                        authManager.signOut()
                        if (pendingSignIn == null) {
                            _state.value = ClerkAuthState.SignedOut
                        }
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

        pendingSignIn = null
        pendingCodeStep = null
        authManager.onClerkSignIn(userId, token)
        _state.value = ClerkAuthState.SignedIn(userId)
    }

    suspend fun signInWithPassword(email: String, password: String) {
        val identifier = email.trim().lowercase()
        val createResult = SignIn.create(
            SignIn.CreateParams.Strategy.Password(
                identifier = identifier,
                password = password,
            )
        )

        when (createResult) {
            is ClerkResult.Success -> handleSignInResult(createResult.value)
            is ClerkResult.Failure -> {
                val message = createResult.throwable?.message
                    ?.takeIf { it.isNotBlank() }
                    ?: "Invalid email or password"
                Log.w(TAG, "Password sign-in failed for $identifier: $message", createResult.throwable)
                throw IllegalStateException(message, createResult.throwable)
            }
        }
    }

    suspend fun submitVerificationCode(code: String) {
        val signIn = pendingSignIn ?: throw IllegalStateException("Start sign-in again.")
        val step = pendingCodeStep ?: throw IllegalStateException("No verification step is pending.")

        val result = when (step) {
            PendingCodeStep.SECOND_FACTOR_EMAIL -> signIn.attemptSecondFactor(
                SignIn.AttemptSecondFactorParams.EmailCode(code = code)
            )
            PendingCodeStep.SECOND_FACTOR_PHONE -> signIn.attemptSecondFactor(
                SignIn.AttemptSecondFactorParams.PhoneCode(code = code)
            )
        }

        when (result) {
            is ClerkResult.Success -> handleSignInResult(result.value)
            is ClerkResult.Failure -> {
                val message = result.throwable?.message
                    ?.takeIf { it.isNotBlank() }
                    ?: "Invalid verification code"
                Log.w(TAG, "Verification failed: $message", result.throwable)
                throw IllegalStateException(message, result.throwable)
            }
        }
    }

    private suspend fun handleSignInResult(signIn: SignIn) {
        val sessionId = signIn.createdSessionId
        if (!sessionId.isNullOrBlank()) {
            val active = Clerk.setActive(sessionId, null)
            if (active !is ClerkResult.Success) {
                throw IllegalStateException("Signed in, but failed to activate session")
            }
            return
        }

        when (signIn.status) {
            SignIn.Status.NEEDS_SECOND_FACTOR -> prepareSecondFactor(signIn)
            else -> {
                val status = signIn.status.name.lowercase()
                throw IllegalStateException("Sign-in requires a step the app does not support yet ($status)")
            }
        }
    }

    private suspend fun prepareSecondFactor(signIn: SignIn) {
        val preparedResult = signIn.prepareSecondFactor()
        when (preparedResult) {
            is ClerkResult.Success -> {
                val prepared = preparedResult.value
                val emailFactor = prepared.supportedSecondFactors
                    ?.firstOrNull { it.strategy == SignIn.PrepareSecondFactorParams.EMAIL_CODE }
                val phoneFactor = prepared.supportedSecondFactors
                    ?.firstOrNull { it.strategy == SignIn.PrepareSecondFactorParams.PHONE_CODE }

                pendingSignIn = prepared
                pendingCodeStep = when {
                    emailFactor != null -> PendingCodeStep.SECOND_FACTOR_EMAIL
                    phoneFactor != null -> PendingCodeStep.SECOND_FACTOR_PHONE
                    else -> null
                }

                val hint = when {
                    emailFactor != null -> "Check your email for the code from Clerk."
                    phoneFactor != null -> "Check your phone for the code from Clerk."
                    else -> null
                }

                if (pendingCodeStep == null || hint == null) {
                    throw IllegalStateException("Clerk requested MFA, but no email or phone code factor was available.")
                }

                _state.value = ClerkAuthState.NeedsCode(hint)
            }
            is ClerkResult.Failure -> {
                val message = preparedResult.throwable?.message
                    ?.takeIf { it.isNotBlank() }
                    ?: "Failed to send verification code"
                Log.w(TAG, "Preparing second factor failed: $message", preparedResult.throwable)
                throw IllegalStateException(message, preparedResult.throwable)
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
            pendingSignIn = null
            pendingCodeStep = null
            _state.value = ClerkAuthState.SignedOut
        } catch (e: Exception) {
            Log.e(TAG, "Sign out failed", e)
            authManager.signOut()
            pendingSignIn = null
            pendingCodeStep = null
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
