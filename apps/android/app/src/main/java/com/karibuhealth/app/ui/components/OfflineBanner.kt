package com.karibuhealth.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun OfflineBanner(
    isOnline: Boolean,
    pendingSyncCount: Int,
    deviceSavedCount: Int = 0,
    failedSyncCount: Int = 0,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = !isOnline || pendingSyncCount > 0 || deviceSavedCount > 0 || failedSyncCount > 0,
        enter = slideInVertically(),
        exit = slideOutVertically(),
        modifier = modifier,
    ) {
        // Only enable taps when there's a queue to show. Offline-only state
        // (no pending items) leaves the banner non-interactive so we don't
        // open an empty details sheet.
        val tappable = (pendingSyncCount > 0 || failedSyncCount > 0) && onClick != null
        // Offline is the NORMAL state on intermittent 3G — it is status, not a
        // warning. Amber is reserved for AI/urgency, so offline uses calm neutral
        // chrome (surfaceVariant); the pending-sync state keeps the soft-cobalt
        // primaryContainer. Terminally-failed entries are the one true warning
        // state — clinical writes that stopped retrying — so they use error
        // chrome.
        val containerColor = when {
            failedSyncCount > 0 -> MaterialTheme.colorScheme.errorContainer
            !isOnline -> MaterialTheme.colorScheme.surfaceVariant
            else -> MaterialTheme.colorScheme.primaryContainer
        }
        val contentColor = when {
            failedSyncCount > 0 -> MaterialTheme.colorScheme.onErrorContainer
            !isOnline -> MaterialTheme.colorScheme.onSurfaceVariant
            else -> MaterialTheme.colorScheme.onPrimaryContainer
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(containerColor)
                .then(if (tappable) Modifier.clickable(onClick = onClick!!) else Modifier)
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = if (!isOnline) Icons.Default.CloudOff else Icons.Default.Sync,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = contentColor,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                // WP2 D4: when there are terminally-failed entries, surface BOTH
                // numbers so a shrinking pending count never hides the stuck ones,
                // e.g. "61 pending · 3 need attention".
                text = when {
                    failedSyncCount > 0 && pendingSyncCount > 0 ->
                        "$pendingSyncCount pending · $failedSyncCount need attention" +
                            (if (tappable) " — tap to review" else "")
                    failedSyncCount > 0 ->
                        "$failedSyncCount need attention" + (if (tappable) " — tap to review" else "")
                    !isOnline -> "Offline — saved on this device"
                    pendingSyncCount > 0 && tappable ->
                        "$pendingSyncCount to sync to cloud — tap for details"
                    pendingSyncCount > 0 ->
                        "$pendingSyncCount to sync to cloud"
                    deviceSavedCount > 0 ->
                        "$deviceSavedCount saved on device"
                    else -> "Syncing…"
                },
                style = MaterialTheme.typography.labelMedium,
                color = contentColor,
            )
        }
    }
}
