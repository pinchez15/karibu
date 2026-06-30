package com.karibuhealth.learn.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.learn.KlBtnKind
import com.karibuhealth.learn.KlButton
import com.karibuhealth.learn.LocalKl
import com.karibuhealth.learn.data.supabase.LearnAuthRepository
import com.karibuhealth.learn.data.supabase.normalizeUgandaPhone
import com.karibuhealth.learn.chart.MonoFamily
import kotlinx.coroutines.launch

private enum class AuthStep { Phone, Otp, Email, EmailOtp }

/** Must match Supabase → Authentication → Email → Email OTP length (6). */
private const val EMAIL_OTP_LENGTH = 6
private const val PHONE_OTP_LENGTH = 6
private const val MIN_PASSWORD_LENGTH = 8

@Composable
fun LearnAuthScreen(
    authRepository: LearnAuthRepository,
    onBack: () -> Unit,
    onSignedIn: () -> Unit,
) {
    val kl = LocalKl.current
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(AuthStep.Phone) }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isSignUp by remember { mutableStateOf(false) }
    var otp by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val normalizedPhone = remember(phone) { normalizeUgandaPhone(phone) }
    val trimmedEmail = email.trim()
    val passwordReady = password.length >= MIN_PASSWORD_LENGTH

    Column(
        Modifier
            .fillMaxSize()
            .background(kl.bg)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp, vertical = 18.dp),
    ) {
        KlButton(
            text = "Back",
            onClick = onBack,
            modifier = Modifier.fillMaxWidth(),
            kind = KlBtnKind.Ghost,
            leadingIcon = Icons.AutoMirrored.Filled.ArrowBack,
        )
        Spacer(Modifier.height(20.dp))
        Text(if (isSignUp && step == AuthStep.Email) "Create account" else "Sign in", color = kl.ink, fontSize = 26.sp)
        Text(
            "Save CME credit and sync progress across devices.",
            color = kl.muted,
            fontSize = 14.sp,
            modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.height(24.dp))

        if (!authRepository.isConfigured) {
            Text(
                "Supabase is not configured. Add LEARN_SUPABASE_URL and LEARN_SUPABASE_ANON_KEY to local.properties.",
                color = kl.muted,
                fontSize = 13.sp,
            )
            return@Column
        }

        when (step) {
            AuthStep.Phone -> {
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone number") },
                    placeholder = { Text("+256 7XX XXX XXX") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                KlButton(
                    text = if (busy) "Sending…" else "Send SMS code",
                    onClick = {
                        if (busy) return@KlButton
                        scope.launch {
                            busy = true
                            error = null
                            runCatching { authRepository.sendPhoneOtp(normalizedPhone) }
                                .onSuccess { step = AuthStep.Otp }
                                .onFailure { error = it.message ?: "Could not send code" }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy && phone.isNotBlank(),
                )
                Spacer(Modifier.height(16.dp))
                Text("OR", fontFamily = MonoFamily, color = kl.muted, fontSize = 10.sp)
                Spacer(Modifier.height(12.dp))
                KlButton(
                    text = "Use email instead",
                    onClick = { step = AuthStep.Email; error = null },
                    modifier = Modifier.fillMaxWidth(),
                    kind = KlBtnKind.Ghost,
                )
            }

            AuthStep.Otp -> {
                Text("Code sent to $normalizedPhone", color = kl.muted, fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = otp,
                    onValueChange = { otp = it.filter { ch -> ch.isDigit() }.take(PHONE_OTP_LENGTH) },
                    label = { Text("$PHONE_OTP_LENGTH-digit code") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                KlButton(
                    text = if (busy) "Verifying…" else "Verify and continue",
                    onClick = {
                        if (busy) return@KlButton
                        scope.launch {
                            busy = true
                            error = null
                            runCatching { authRepository.verifyPhoneOtp(normalizedPhone, otp) }
                                .onSuccess { onSignedIn() }
                                .onFailure { error = it.message ?: "Invalid code" }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy && otp.length >= PHONE_OTP_LENGTH,
                )
            }

            AuthStep.Email -> {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    supportingText = {
                        Text("At least $MIN_PASSWORD_LENGTH characters", color = kl.muted, fontSize = 12.sp)
                    },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                KlButton(
                    text = when {
                        busy -> if (isSignUp) "Creating account…" else "Signing in…"
                        isSignUp -> "Create account"
                        else -> "Sign in with password"
                    },
                    onClick = {
                        if (busy) return@KlButton
                        scope.launch {
                            busy = true
                            error = null
                            val action = if (isSignUp) {
                                authRepository::signUpWithPassword
                            } else {
                                authRepository::signInWithPassword
                            }
                            runCatching { action(trimmedEmail, password) }
                                .onSuccess { onSignedIn() }
                                .onFailure { error = it.message ?: "Could not sign in" }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy && trimmedEmail.contains("@") && passwordReady,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    if (isSignUp) "Already have an account? Sign in" else "New here? Create an account",
                    color = kl.primary,
                    fontSize = 13.sp,
                    modifier = Modifier
                        .clickable(enabled = !busy) {
                            isSignUp = !isSignUp
                            error = null
                        }
                        .padding(vertical = 4.dp),
                )
                Spacer(Modifier.height(8.dp))
                KlButton(
                    text = "Send one-time code instead",
                    onClick = {
                        if (busy) return@KlButton
                        scope.launch {
                            busy = true
                            error = null
                            runCatching { authRepository.sendEmailOtp(trimmedEmail) }
                                .onSuccess {
                                    password = ""
                                    step = AuthStep.EmailOtp
                                }
                                .onFailure { error = it.message ?: "Could not send code" }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    kind = KlBtnKind.Ghost,
                    enabled = !busy && trimmedEmail.contains("@"),
                )
            }

            AuthStep.EmailOtp -> {
                Text("Code sent to $trimmedEmail", color = kl.muted, fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = otp,
                    onValueChange = { otp = it.filter { ch -> ch.isDigit() }.take(EMAIL_OTP_LENGTH) },
                    label = { Text("$EMAIL_OTP_LENGTH-digit code") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                KlButton(
                    text = if (busy) "Verifying…" else "Verify and continue",
                    onClick = {
                        if (busy) return@KlButton
                        scope.launch {
                            busy = true
                            error = null
                            runCatching { authRepository.verifyEmailOtp(trimmedEmail, otp) }
                                .onSuccess { onSignedIn() }
                                .onFailure { error = it.message ?: "Invalid code" }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy && otp.length >= EMAIL_OTP_LENGTH,
                )
            }
        }

        error?.let {
            Spacer(Modifier.height(14.dp))
            Text(it, color = kl.primary, fontSize = 13.sp)
        }

        if (step == AuthStep.Otp || step == AuthStep.EmailOtp) {
            Spacer(Modifier.height(16.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                KlButton(
                    text = "Resend code",
                    onClick = {
                        scope.launch {
                            busy = true
                            error = null
                            runCatching {
                                when (step) {
                                    AuthStep.Otp -> authRepository.sendPhoneOtp(normalizedPhone)
                                    AuthStep.EmailOtp -> authRepository.sendEmailOtp(trimmedEmail)
                                    else -> Unit
                                }
                            }.onFailure { error = it.message ?: "Could not resend" }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    kind = KlBtnKind.Ghost,
                    enabled = !busy,
                )
                KlButton(
                    text = "Change number or email",
                    onClick = {
                        otp = ""
                        step = if (step == AuthStep.Otp) AuthStep.Phone else AuthStep.Email
                        error = null
                    },
                    modifier = Modifier.fillMaxWidth(),
                    kind = KlBtnKind.Ghost,
                )
            }
        }
    }
}
