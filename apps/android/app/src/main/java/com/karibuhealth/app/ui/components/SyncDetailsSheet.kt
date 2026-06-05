package com.karibuhealth.app.ui.components

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Line

/**
 * Bottom sheet that surfaces every queue entry currently counted as pending
 * or failed, with two escape hatches:
 *
 *  - "Retry all" — un-fails any maxed-out entries and re-runs the sync engine.
 *    First-line fix when the server was briefly unreachable.
 *  - "Mark synced" per-entry — for the case where the data has already landed
 *    on the server through some other path but the local queue entry never
 *    flipped to completed (the "9 items pending forever" bug). Flips the
 *    entry to `completed` without re-running the RPC.
 *
 * The clinician is the authority. We surface what's stuck plus give them a
 * way out — we don't silently auto-clear, which would hide real failures.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncDetailsSheet(
    entries: List<SyncQueueEntry>,
    onDismiss: () -> Unit,
    onRetryAll: () -> Unit,
    onMarkSynced: (String) -> Unit,
    onExportDebugLog: (() -> String)? = null,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Pending sync",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Entries waiting to push to the server. If you've confirmed an item already shows up in the web app, tap “Mark synced” to clear it locally.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (entries.isEmpty()) {
                Text(
                    text = "Nothing pending. You're all caught up.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(entries, key = { it.id }) { entry ->
                        SyncEntryRow(
                            entry = entry,
                            onMarkSynced = { onMarkSynced(entry.id) },
                        )
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Button(
                    onClick = onRetryAll,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.height(16.dp))
                    Spacer(Modifier.height(0.dp))
                    Text("  Retry all", fontWeight = FontWeight.SemiBold)
                }
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text("Close")
                }
            }

            onExportDebugLog?.let { export ->
                OutlinedButton(
                    onClick = {
                        val logText = export()
                        if (logText.isBlank()) return@OutlinedButton
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, "Karibu sync debug log")
                            putExtra(Intent.EXTRA_TEXT, logText)
                        }
                        context.startActivity(Intent.createChooser(share, "Share debug log"))
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text("Share debug log")
                }
            }
        }
    }
}

@Composable
private fun SyncEntryRow(
    entry: SyncQueueEntry,
    onMarkSynced: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, Line),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = entry.operationType,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                StatusChip(status = entry.status, attempts = entry.attempts)
            }
            Text(
                text = "id: ${entry.entityId.take(8)}…  ·  attempts ${entry.attempts}/${entry.maxAttempts}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            entry.lastError?.takeIf { it.isNotBlank() }?.let { err ->
                Text(
                    text = err,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            OutlinedButton(
                onClick = onMarkSynced,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.align(Alignment.End),
            ) {
                Text("Mark synced")
            }
        }
    }
}

@Composable
private fun StatusChip(status: String, attempts: Int) {
    val (label, color) = when (status) {
        "failed" -> "FAILED" to MaterialTheme.colorScheme.error
        "pending" -> if (attempts > 0) "RETRYING" to Amber else "QUEUED" to MaterialTheme.colorScheme.onSurfaceVariant
        else -> status.uppercase() to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Box(
        modifier = Modifier
            .padding(start = 8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = color,
        )
    }
}
