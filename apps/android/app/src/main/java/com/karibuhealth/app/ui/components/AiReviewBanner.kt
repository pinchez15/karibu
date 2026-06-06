package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Muted

/**
 * AI review questions from the Inngest pipeline. The clinician is the authority.
 * Each suggestion has two explicit buttons: **Dismiss** on the left, **Incorporate**
 * on the right (incorporating opens dictation). Replaces the earlier swipe gesture,
 * which now belongs to navigation.
 */
@Composable
fun AiReviewBanner(
    suggestions: List<AiReviewSuggestionDto>,
    onDismiss: (AiReviewSuggestionDto) -> Unit,
    onIncorporate: (AiReviewSuggestionDto) -> Unit,
    modifier: Modifier = Modifier,
) {
    val pending = remember(suggestions) { dedupeAiReviewSuggestions(suggestions) }
    if (pending.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "AI review · your call",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
        )
        pending.forEach { suggestion ->
            AiReviewActionCard(
                suggestion = suggestion,
                onDismiss = { onDismiss(suggestion) },
                onIncorporate = { onIncorporate(suggestion) },
            )
        }
    }
}

@Composable
private fun AiReviewActionCard(
    suggestion: AiReviewSuggestionDto,
    onDismiss: () -> Unit,
    onIncorporate: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Amber.copy(alpha = 0.12f))
            .border(1.dp, Amber.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Default.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = Amber,
            )
            Text(
                text = suggestion.question,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Text(
            text = displayAiReasoning(suggestion.reasoning),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = suggestionTypeLabel(suggestion.suggestionType),
            style = MaterialTheme.typography.labelSmall,
            color = Muted,
        )
        Spacer(Modifier.size(2.dp))
        // Left: Dismiss. Right: Incorporate.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onDismiss) { Text("Dismiss") }
            OutlinedButton(onClick = onIncorporate) { Text("Incorporate") }
        }
    }
}

private fun suggestionTypeLabel(type: String): String = when (type) {
    "ask_lab" -> "Suggested investigation · opens lab picker"
    "ask_med" -> "Suggested medication · opens Rx picker"
    "ask_dx" -> "Suggested diagnosis review · opens note"
    "ask_history" -> "Suggested history · opens note"
    "ask_red_flag" -> "Suggested exam review · opens note"
    else -> "Incorporate to add this to your note"
}
