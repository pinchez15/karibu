package com.karibuhealth.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = true,
    val error: String? = null,
    val isAuthenticated: Boolean = false,
    val isSubmitting: Boolean = false,
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val clerkAuthManager: ClerkAuthManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            clerkAuthManager.state.collect { state ->
                when (state) {
                    ClerkAuthState.Loading -> _uiState.update {
                        it.copy(isLoading = true, error = null, isAuthenticated = false)
                    }
                    ClerkAuthState.SignedOut -> _uiState.update {
                        it.copy(isLoading = false, error = null, isAuthenticated = false, isSubmitting = false)
                    }
                    is ClerkAuthState.SignedIn -> _uiState.update {
                        it.copy(isLoading = false, error = null, isAuthenticated = true, isSubmitting = false)
                    }
                    is ClerkAuthState.Error -> _uiState.update {
                        it.copy(isLoading = false, error = state.message, isAuthenticated = false, isSubmitting = false)
                    }
                }
            }
        }
    }

    fun updateEmail(email: String) {
        _uiState.update { it.copy(email = email, error = null) }
    }

    fun updatePassword(password: String) {
        _uiState.update { it.copy(password = password, error = null) }
    }

    fun signIn() {
        val email = _uiState.value.email.trim()
        val password = _uiState.value.password

        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(error = "Enter your email and password") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            try {
                clerkAuthManager.signInWithPassword(email, password)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        error = e.message ?: "Invalid email or password",
                    )
                }
            }
        }
    }

    fun retryInitialize() {
        clerkAuthManager.retryInitialize()
    }
}
