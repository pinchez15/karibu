package com.karibuhealth.app.ui.adaptive

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Side-by-side list + detail on tablet; list-only on phone (detail via nav).
 */
@Composable
fun KaribuListDetailScaffold(
    listContent: @Composable () -> Unit,
    detailContent: @Composable () -> Unit,
    showDetail: Boolean,
    modifier: Modifier = Modifier,
    emptyDetail: @Composable () -> Unit = { ListDetailEmptyPlaceholder() },
) {
    if (!supportsListDetail()) {
        listContent()
        return
    }

    Row(modifier = modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .weight(KaribuLayout.listPaneWeight())
                .fillMaxHeight(),
        ) {
            listContent()
        }
        VerticalDivider()
        Box(
            modifier = Modifier
                .weight(KaribuLayout.detailPaneWeight())
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.surface),
        ) {
            if (showDetail) {
                detailContent()
            } else {
                emptyDetail()
            }
        }
    }
}

@Composable
fun ListDetailEmptyPlaceholder(
    title: String = "Select an item",
    subtitle: String = "Choose a row on the left to see details here.",
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        ColumnCenteredText(title = title, subtitle = subtitle)
    }
}

@Composable
private fun ColumnCenteredText(title: String, subtitle: String) {
    androidx.compose.foundation.layout.Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}
