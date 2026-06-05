package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.remote.dto.VisitCriticalAlertDto
import com.karibuhealth.app.domain.AlertTier
import com.karibuhealth.app.domain.CriticalAlertRules
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Red
import com.karibuhealth.app.ui.theme.RedSoft

/**
 * Visit critical-alert banner. The acuity tier (derived from the rule slug, the
 * single source of truth in [CriticalAlertRules]) drives the salience:
 *
 * - **Critical** clinical danger sign → RED: red-tinted surface, a 1.5 dp red
 *   border, a warning icon, and a mono "CRITICAL · DANGER SIGN" eyebrow. The
 *   primary action is "Acknowledge".
 * - **Confirm** data-entry sanity check → calm cobalt, primary action
 *   "Yes, correct".
 *
 * In both tiers the two recorded responses are dominant and "Dismiss" (which
 * leaves no record) is demoted, so it can never be the reflexive tap on a
 * danger sign. The clinician remains the final authority — the banner prompts,
 * it does not act.
 */
@Composable
fun VisitCriticalAlertBanner(
    alert: VisitCriticalAlertDto,
    onConfirmData: () -> Unit,
    onDataError: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (alert.clinicianResponse != null) return

    val critical = CriticalAlertRules.tierFor(alert.ruleSlug) == AlertTier.Critical
    val shape = RoundedCornerShape(12.dp)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (critical) RedSoft else CobaltSoft)
            .then(if (critical) Modifier.border(1.5.dp, Red, shape) else Modifier)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (critical) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Warning,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = Red,
                )
                Text(
                    text = "CRITICAL · DANGER SIGN",
                    style = MaterialTheme.typography.labelSmall,
                    color = Red,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
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
            Button(onClick = onConfirmData) {
                Text(if (critical) "Acknowledge" else "Yes, correct")
            }
            OutlinedButton(onClick = onDataError) { Text("Data error") }
            TextButton(onClick = onDismiss) {
                Text("Dismiss", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
