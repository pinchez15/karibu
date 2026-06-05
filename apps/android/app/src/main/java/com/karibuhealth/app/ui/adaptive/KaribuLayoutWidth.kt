package com.karibuhealth.app.ui.adaptive

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** M3-aligned width buckets for phone vs clinic tablet (e.g. Tab A11 8.7"). */
enum class KaribuLayoutWidth {
    /** Phone portrait; full-screen stack navigation. */
    Compact,
    /** Small tablet portrait; navigation rail, optional list-detail. */
    Medium,
    /** Tablet landscape / large tablet; rail + list-detail + multi-column forms. */
    Expanded,
}

val LocalKaribuLayoutWidth = staticCompositionLocalOf { KaribuLayoutWidth.Compact }

@Composable
fun currentKaribuLayoutWidth(): KaribuLayoutWidth = LocalKaribuLayoutWidth.current

@Composable
fun supportsListDetail(): Boolean = currentKaribuLayoutWidth() != KaribuLayoutWidth.Compact

@Composable
fun supportsMultiColumn(): Boolean = currentKaribuLayoutWidth() == KaribuLayoutWidth.Expanded

@Composable
fun usesNavigationRail(): Boolean = currentKaribuLayoutWidth() != KaribuLayoutWidth.Compact

/**
 * Provides [KaribuLayoutWidth] from the current max width. Wrap at the app
 * root (inside theme) so all screens can branch without Activity coupling.
 */
@Composable
fun KaribuAdaptiveProvider(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val width = layoutWidthFor(maxWidth)
        CompositionLocalProvider(LocalKaribuLayoutWidth provides width) {
            content()
        }
    }
}

fun layoutWidthFor(maxWidth: Dp): KaribuLayoutWidth = when {
    maxWidth < 600.dp -> KaribuLayoutWidth.Compact
    maxWidth < 840.dp -> KaribuLayoutWidth.Medium
    else -> KaribuLayoutWidth.Expanded
}
