package com.karibuhealth.app.ui.adaptive

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Queue lists on phone; adaptive grid on tablet for lab/pharmacy homes.
 */
@Composable
fun <T> KaribuAdaptiveQueue(
    items: List<T>,
    key: (T) -> Any,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(KaribuLayout.contentPaddingHorizontal(), 12.dp),
    horizontalSpacing: Dp = 8.dp,
    verticalSpacing: Dp = 8.dp,
    itemContent: @Composable (T) -> Unit,
) {
    val minCell = KaribuLayout.queueGridMinCellWidth()
    if (minCell == Dp.Unspecified) {
        LazyColumn(
            modifier = modifier,
            contentPadding = contentPadding,
            verticalArrangement = Arrangement.spacedBy(verticalSpacing),
        ) {
            items(items, key = key) { item -> itemContent(item) }
        }
    } else {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minCell),
            modifier = modifier,
            contentPadding = contentPadding,
            horizontalArrangement = Arrangement.spacedBy(horizontalSpacing),
            verticalArrangement = Arrangement.spacedBy(verticalSpacing),
        ) {
            items(items, key = key) { item -> itemContent(item) }
        }
    }
}
