package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.remote.dto.VisitCriticalAlertDto
import com.karibuhealth.app.ui.theme.CobaltSoft

@Composable
fun VisitCriticalAlertBanner(
    alert: VisitCriticalAlertDto,
    onConfirmData: () -> Unit,
    onDataError: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (alert.clinicianResponse != null) return

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(CobaltSoft, RoundedCornerShape(12.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = alert.confirmQuestion,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = alert.clinicalPrompt,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        // The two RECORDED responses are dominant; "Dismiss" (which leaves no
        // record) is demoted so it can't be the reflexive tap. This is a
        // data-confirmation prompt today, so the surface stays calm cobalt — when
        // acuity-tier alerts are added, drive the colour from the alert tier
        // (red for a genuine clinical-critical finding).
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onConfirmData) { Text("Yes, correct") }
            OutlinedButton(onClick = onDataError) { Text("Data error") }
            TextButton(onClick = onDismiss) {
                Text("Dismiss", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
