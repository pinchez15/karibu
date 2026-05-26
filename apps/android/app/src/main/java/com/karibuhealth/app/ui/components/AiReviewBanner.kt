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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Muted

/**
 * AI review questions from the Inngest pipeline. Clinician is the authority.
 * Swipe left to dismiss; swipe right to incorporate into the note (opens dictation).
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
            text = "Swipe ← dismiss · incorporate →",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
        )
        pending.forEach { suggestion ->
            AiReviewSwipeCard(
                suggestion = suggestion,
                onDismiss = { onDismiss(suggestion) },
                onIncorporate = { onIncorporate(suggestion) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AiReviewSwipeCard(
    suggestion: AiReviewSuggestionDto,
    onDismiss: () -> Unit,
    onIncorporate: () -> Unit,
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> {
                    onIncorporate()
                    true
                }
                SwipeToDismissBoxValue.EndToStart -> {
                    onDismiss()
                    true
                }
                SwipeToDismissBoxValue.Settled -> false
            }
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = true,
        enableDismissFromEndToStart = true,
        backgroundContent = {
            val direction = dismissState.dismissDirection
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        when (direction) {
                            SwipeToDismissBoxValue.StartToEnd -> Green.copy(alpha = 0.18f)
                            SwipeToDismissBoxValue.EndToStart -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.55f)
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        },
                    )
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Incorporate",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Green,
                )
                Text(
                    text = "Dismiss",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
    ) {
        AiReviewCardContent(suggestion = suggestion)
    }
}

@Composable
private fun AiReviewCardContent(suggestion: AiReviewSuggestionDto) {
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
        Spacer(Modifier.size(2.dp))
        Text(
            text = suggestionTypeLabel(suggestion.suggestionType),
            style = MaterialTheme.typography.labelSmall,
            color = Muted,
        )
    }
}

private fun suggestionTypeLabel(type: String): String = when (type) {
    "ask_lab" -> "Suggested investigation · opens lab picker"
    "ask_med" -> "Suggested medication · opens Rx picker"
    "ask_dx" -> "Suggested diagnosis review · opens note"
    "ask_history" -> "Suggested history · opens note"
    "ask_red_flag" -> "Suggested exam review · opens note"
    else -> "Swipe right to incorporate into your note"
}
