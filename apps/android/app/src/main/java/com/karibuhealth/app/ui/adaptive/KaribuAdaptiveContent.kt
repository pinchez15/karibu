package com.karibuhealth.app.ui.adaptive

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Modifier for AlertDialogs — caps width on tablet. */
@Composable
fun karibuDialogModifier(): Modifier {
    val maxWidth = KaribuLayout.dialogMaxWidth()
    return if (maxWidth != Dp.Unspecified) {
        Modifier.widthIn(max = maxWidth)
    } else {
        Modifier
    }
}

/** Centers content and applies max width on tablet. */
@Composable
fun KaribuAdaptiveWidthBox(
    modifier: Modifier = Modifier,
    maxWidth: Dp? = KaribuLayout.contentMaxWidth(),
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.TopCenter,
    ) {
        val widthModifier = if (maxWidth != null) {
            Modifier.widthIn(max = maxWidth).fillMaxWidth()
        } else {
            Modifier.fillMaxWidth()
        }
        Box(modifier = widthModifier) {
            content()
        }
    }
}

/** Two columns on expanded tablet; single column otherwise. */
@Composable
fun KaribuTwoColumnRow(
    modifier: Modifier = Modifier,
    spacing: Dp = 16.dp,
    leftWeight: Float = 1f,
    rightWeight: Float = 1f,
    left: @Composable () -> Unit,
    right: @Composable () -> Unit,
) {
    if (supportsMultiColumn()) {
        Row(
            modifier = modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(spacing),
        ) {
            Box(Modifier.weight(leftWeight)) { left() }
            Box(Modifier.weight(rightWeight)) { right() }
        }
    } else {
        Column(
            modifier = modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(spacing),
        ) {
            left()
            right()
        }
    }
}

/** Form fields in a 2-column grid on expanded width. */
@Composable
fun KaribuFormGrid(
    modifier: Modifier = Modifier,
    spacing: Dp = 12.dp,
    content: @Composable () -> Unit,
) {
    if (supportsMultiColumn()) {
        // Callers place pairs of fields in KaribuTwoColumnRow; this wrapper
        // only adds consistent vertical spacing between grid rows.
        Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(spacing)) {
            content()
        }
    } else {
        Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(spacing)) {
            content()
        }
    }
}
