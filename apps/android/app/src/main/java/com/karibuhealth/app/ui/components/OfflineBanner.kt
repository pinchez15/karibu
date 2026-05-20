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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.ui.theme.Amber as KaribuWarning

@Composable
fun OfflineBanner(
    isOnline: Boolean,
    pendingSyncCount: Int,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = !isOnline || pendingSyncCount > 0,
        enter = slideInVertically(),
        exit = slideOutVertically(),
        modifier = modifier,
    ) {
        // Only enable taps when there's a queue to show. Offline-only state
        // (no pending items) leaves the banner non-interactive so we don't
        // open an empty details sheet.
        val tappable = pendingSyncCount > 0 && onClick != null
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (!isOnline) KaribuWarning else MaterialTheme.colorScheme.primaryContainer)
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
                tint = if (!isOnline) Color.White else MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = when {
                    !isOnline -> "You're offline. Data is saved locally."
                    tappable -> "$pendingSyncCount item${if (pendingSyncCount != 1) "s" else ""} pending sync — tap to review"
                    else -> "$pendingSyncCount item${if (pendingSyncCount != 1) "s" else ""} pending sync"
                },
                style = MaterialTheme.typography.labelMedium,
                color = if (!isOnline) Color.White else MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}
