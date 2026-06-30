package com.karibuhealth.learn.data.supabase

import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.OTP
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

class LearnAuthRepository {
    private val supabase get() = LearnSupabase.client

    val isConfigured: Boolean get() = LearnSupabase.isConfigured

    val isSignedIn: Boolean
        get() = supabase?.auth?.currentSessionOrNull() != null

    val sessionStatus: Flow<Boolean> =
        if (supabase == null) {
            flowOf(false)
        } else {
            supabase!!.auth.sessionStatus.map { status ->
                status is SessionStatus.Authenticated
            }
        }

    suspend fun sendPhoneOtp(phone: String) {
        val client = supabase ?: throw IllegalStateException("Supabase is not configured")
        client.auth.signInWith(OTP) {
            this.phone = phone
        }
    }

    suspend fun verifyPhoneOtp(phone: String, token: String) {
        val client = supabase ?: throw IllegalStateException("Supabase is not configured")
        client.auth.verifyPhoneOtp(
            type = OtpType.Phone.SMS,
            phone = phone,
            token = token,
        )
    }

    suspend fun signUpWithPassword(email: String, password: String) {
        val client = supabase ?: throw IllegalStateException("Supabase is not configured")
        client.auth.signUpWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signInWithPassword(email: String, password: String) {
        val client = supabase ?: throw IllegalStateException("Supabase is not configured")
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun sendEmailOtp(email: String) {
        val client = supabase ?: throw IllegalStateException("Supabase is not configured")
        client.auth.signInWith(OTP, redirectUrl = LEARN_AUTH_REDIRECT_URL) {
            this.email = email
        }
    }

    suspend fun verifyEmailOtp(email: String, token: String) {
        val client = supabase ?: throw IllegalStateException("Supabase is not configured")
        client.auth.verifyEmailOtp(
            type = OtpType.Email.EMAIL,
            email = email,
            token = token,
        )
    }

    suspend fun signOut() {
        supabase?.auth?.signOut()
    }
}

/** Normalize local Uganda numbers to E.164 (+256…). */
fun normalizeUgandaPhone(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.startsWith("+")) {
        return "+" + trimmed.drop(1).filter { it.isDigit() }
    }
    val digits = trimmed.filter { it.isDigit() }
    return when {
        digits.startsWith("256") -> "+$digits"
        digits.startsWith("0") -> "+256${digits.drop(1)}"
        else -> "+256$digits"
    }
}
