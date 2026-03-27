package com.karibuhealth.app.ui.auth

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun AuthScreen(
    onAuthenticated: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(uiState.isAuthenticated) {
        if (uiState.isAuthenticated) onAuthenticated()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Karibu Health",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "EHR for Uganda",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(48.dp))

        if (uiState.isLoading) {
            CircularProgressIndicator()
            Spacer(Modifier.height(16.dp))
            Text("Signing in...", style = MaterialTheme.typography.bodyMedium)
        } else {
            // Primary sign-in: Clerk SDK redirects to hosted sign-in page
            // The ClerkAuthManager handles the callback and JWT exchange
            Button(
                onClick = {
                    // Launch Clerk's sign-in flow
                    // Clerk.getClient().signIn(context as Activity) is handled by ClerkAuthManager
                    // For dev/testing, use direct auth:
                    viewModel.onClerkAuthenticated(
                        clerkUserId = "dev_user_placeholder",
                        supabaseToken = "dev_token_placeholder",
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign In")
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = "Sign in with your clinic credentials.\nYour data stays on this device when offline.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            uiState.error?.let { error ->
                Spacer(Modifier.height(16.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Text(
                        text = error,
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
