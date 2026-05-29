package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Muted

/**
 * Compact sync indicator for patient-scoped screens. Shows offline / pending /
 * synced state without opening the global sync sheet.
 */
@Composable
fun SyncStatusPill(
    pendingCount: Int,
    isOnline: Boolean,
    modifier: Modifier = Modifier,
) {
    val (label, kind) = when {
        !isOnline && pendingCount > 0 -> "$pendingCount offline" to KhStatusKind.Draft
        !isOnline -> "Offline" to KhStatusKind.Draft
        pendingCount > 0 -> "$pendingCount to sync" to KhStatusKind.PendingReview
        else -> "Synced" to KhStatusKind.Signed
    }
    val bg = when (kind) {
        KhStatusKind.Signed, KhStatusKind.Cosigned -> Green.copy(alpha = 0.12f)
        KhStatusKind.PendingReview, KhStatusKind.Draft -> Amber.copy(alpha = 0.14f)
        else -> Muted.copy(alpha = 0.12f)
    }
    Text(
        text = label,
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
