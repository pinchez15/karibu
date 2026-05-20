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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.ui.theme.Amber

/**
 * Surfaces AI review questions the Inngest pipeline wrote against this
 * visit's clinical note. The clinician is the authority — these are
 * high-confidence questions citing Uganda HC III guidelines, not verdicts.
 *
 * Read-only for now (no "Considered" / "Re-open note" buttons) because
 * ai_review_suggestions has no UPDATE RLS policy for Clerk JWTs; the
 * response action ships once the SECURITY DEFINER RPC for it lands.
 * Clinicians can still respond via the web app today.
 */
@Composable
fun AiReviewBanner(
    suggestions: List<AiReviewSuggestionDto>,
    modifier: Modifier = Modifier,
) {
    // Filter to questions still awaiting a response. Once a clinician has
    // already considered/dismissed via web, the banner doesn't reappear.
    val pending = suggestions.filter { it.clinicianResponse == null }
    if (pending.isEmpty()) return

    Column(
        modifier = modifier
            .fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        pending.forEach { suggestion ->
            AiReviewCard(suggestion = suggestion)
        }
    }
}

@Composable
private fun AiReviewCard(suggestion: AiReviewSuggestionDto) {
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
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = Icons.Default.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = Amber,
            )
            Text(
                text = "A QUESTION BEFORE YOU PROCEED",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = Amber,
            )
        }
        Text(
            text = suggestion.question,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = suggestion.reasoning,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.size(2.dp))
        Text(
            text = "Tap Re-open or Already considered on the web visit to respond.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
        )
    }
}
