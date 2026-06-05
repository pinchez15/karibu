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
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
 *
 * Incorporating a suggestion mutates the clinical note (it opens the picker /
 * dictation), so it must be a deliberate, explicit action — never a gesture that
 * a stray swipe on a shared device in sunlight could trigger. Both actions are
 * explicit buttons, matching [AiNotesTimeline]. "Incorporate" carries the
 * emphasis; "Dismiss" is a quiet, neutral action (not red — declining a
 * suggestion is benign, and red is reserved for clinical-critical findings).
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
        pending.forEach { suggestion ->
            AiReviewCard(
                suggestion = suggestion,
                onDismiss = { onDismiss(suggestion) },
                onIncorporate = { onIncorporate(suggestion) },
            )
        }
    }
}

@Composable
private fun AiReviewCard(
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
        verticalArrangement = Arrangement.spacedBy(6.dp),
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
        Row(
            modifier = Modifier.align(Alignment.End),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onDismiss) {
                Text("Dismiss", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            FilledTonalButton(onClick = onIncorporate) {
                Text("Incorporate")
            }
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
