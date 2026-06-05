package com.karibuhealth.app.ui.adaptive

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Responsive layout tokens. Phones keep existing spacing; tablets gain rail
 * chrome and optional max content width so forms do not stretch edge-to-edge.
 */
object KaribuLayout {
    @Composable
    fun contentPaddingHorizontal(): Dp = when (currentKaribuLayoutWidth()) {
        KaribuLayoutWidth.Compact -> 20.dp
        KaribuLayoutWidth.Medium -> 24.dp
        KaribuLayoutWidth.Expanded -> 28.dp
    }

    @Composable
    fun contentPadding(): PaddingValues = PaddingValues(
        horizontal = contentPaddingHorizontal(),
        vertical = 12.dp,
    )

    /** Max width for centered single-column flows (auth, new visit). */
    @Composable
    fun constrainedFormMaxWidth(): Dp = when (currentKaribuLayoutWidth()) {
        KaribuLayoutWidth.Expanded -> 520.dp
        KaribuLayoutWidth.Medium -> 480.dp
        KaribuLayoutWidth.Compact -> Dp.Unspecified
    }

    @Composable
    fun contentMaxWidth(): Dp? = when (currentKaribuLayoutWidth()) {
        KaribuLayoutWidth.Expanded -> 1280.dp
        KaribuLayoutWidth.Medium -> 960.dp
        KaribuLayoutWidth.Compact -> null
    }

    /** List pane fraction when using list-detail on tablet. */
    @Composable
    fun listPaneWeight(): Float = when (currentKaribuLayoutWidth()) {
        KaribuLayoutWidth.Expanded -> 0.38f
        KaribuLayoutWidth.Medium -> 0.42f
        KaribuLayoutWidth.Compact -> 1f
    }

    @Composable
    fun detailPaneWeight(): Float = 1f - listPaneWeight()

    /**
     * Bottom scroll inset: bottom nav on phone, navigation rail on tablet.
     */
    @Composable
    fun bottomBarScrollPadding(): Int = when (currentKaribuLayoutWidth()) {
        KaribuLayoutWidth.Compact -> 96
        KaribuLayoutWidth.Medium -> 24
        KaribuLayoutWidth.Expanded -> 24
    }

    @Composable
    fun queueGridMinCellWidth(): Dp = when (currentKaribuLayoutWidth()) {
        KaribuLayoutWidth.Expanded -> 340.dp
        KaribuLayoutWidth.Medium -> 300.dp
        KaribuLayoutWidth.Compact -> Dp.Unspecified
    }

    @Composable
    fun dialogMaxWidth(): Dp = when (currentKaribuLayoutWidth()) {
        KaribuLayoutWidth.Expanded -> 520.dp
        KaribuLayoutWidth.Medium -> 480.dp
        KaribuLayoutWidth.Compact -> Dp.Unspecified
    }
}
