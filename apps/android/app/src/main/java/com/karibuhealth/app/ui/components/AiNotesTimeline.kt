package com.karibuhealth.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted

/**
 * Collapsed AI notes in the visit timeline (docs/ai-clinical-assist.md).
 */
@Composable
fun AiNotesTimeline(
    suggestions: List<AiReviewSuggestionDto>,
    onDismiss: (AiReviewSuggestionDto) -> Unit,
    onAcknowledge: (AiReviewSuggestionDto) -> Unit,
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
            text = "AI notes",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        pending.forEach { suggestion ->
            AiNoteCollapsedCard(
                suggestion = suggestion,
                onDismiss = { onDismiss(suggestion) },
                onAcknowledge = { onAcknowledge(suggestion) },
                onIncorporate = { onIncorporate(suggestion) },
            )
        }
    }
}

@Composable
private fun AiNoteCollapsedCard(
    suggestion: AiReviewSuggestionDto,
    onDismiss: () -> Unit,
    onAcknowledge: () -> Unit,
    onIncorporate: () -> Unit,
) {
    var expanded by remember(suggestion.id) { mutableStateOf(false) }
    val mohSilent = suggestion.citationIds.isNullOrEmpty()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable { expanded = !expanded }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
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
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = Muted,
            )
        }

        AnimatedVisibility(visible = expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HorizontalDivider(color = Line)
                Text(
                    text = displayAiReasoning(suggestion.reasoning),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (mohSilent) {
                    Text(
                        text = "No Uganda guideline on file — general clinical suggestion.",
                        style = MaterialTheme.typography.labelSmall,
                        color = Muted,
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    TextButton(onClick = onDismiss) { Text("Dismiss") }
                    TextButton(onClick = onAcknowledge) { Text("Acknowledge") }
                    if (suggestion.suggestionType in listOf(
                            "ask_lab", "ask_med", "ask_dx", "ask_history", "ask_red_flag",
                        )
                    ) {
                        OutlinedButton(onClick = onIncorporate) { Text("Incorporate") }
                    }
                }
            }
        }
    }
}
