package com.karibuhealth.app.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

/**
 * Authentication screen using Clerk Android SDK.
 *
 * The Clerk SDK provides a ClerkProvider composable that wraps the app
 * and manages session state. This screen handles:
 * 1. Displaying the sign-in UI via Clerk's prebuilt components
 * 2. After sign-in, requesting a Supabase JWT via getToken(template="supabase")
 * 3. Passing the JWT to AuthManager for local storage and staff lookup
 *
 * Integration notes:
 * - ClerkProvider must wrap the activity's content (done in MainActivity)
 * - The publishable key comes from BuildConfig.CLERK_PUBLISHABLE_KEY
 * - After successful auth, we call clerk.session.getToken(template="supabase")
 *   to get a JWT that Supabase RLS policies can validate via auth.jwt()->>'sub'
 */
@Composable
fun AuthScreen(
    onAuthenticated: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

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
            // Clerk Android SDK integration point:
            // In production, replace this button with Clerk's SignIn composable:
            //
            //   ClerkSignIn(
            //     onSignInComplete = { session ->
            //       val token = session.getToken(GetTokenParams(template = "supabase"))
            //       viewModel.onClerkAuthenticated(session.user.id, token)
            //     }
            //   )
            //
            // For now, this button serves as a placeholder for development.
            // The Clerk SDK handles OAuth, email/password, and SSO flows natively.

            Button(
                onClick = {
                    // TODO: Replace with Clerk SDK sign-in flow
                    // This placeholder simulates a successful sign-in for development
                    viewModel.onClerkAuthenticated(
                        clerkUserId = "dev_user_placeholder",
                        supabaseToken = "dev_token_placeholder",
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign In")
            }

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

        Spacer(Modifier.height(16.dp))
        Text(
            text = "Sign in with your clinic credentials",
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
