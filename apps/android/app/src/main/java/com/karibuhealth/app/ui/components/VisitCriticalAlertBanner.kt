package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onConfirmData) { Text("Yes, correct") }
            TextButton(onClick = onDataError) { Text("Data error") }
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}
