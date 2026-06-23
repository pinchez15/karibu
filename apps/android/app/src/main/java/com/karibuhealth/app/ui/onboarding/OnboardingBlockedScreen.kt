package com.karibuhealth.app.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.ui.theme.KaribuMark

@Composable
fun OnboardingBlockedScreen(onOpenTraining: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        KaribuMark(size = 48.dp, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(20.dp))
        Text(
            "Complete training first",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "Finish KaribuEHR onboarding before registering or checking in real patients. " +
                "Training uses simulated cases only — nothing is saved to your clinic.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        androidx.compose.material3.Button(
            onClick = onOpenTraining,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Open training")
        }
    }
}
