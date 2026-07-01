package com.karibuhealth.app.ui.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Karibu mark — cobalt rounded square with k+ in white.
 * Compose recreation of the SVG in karibu_design_files/brand.jsx.
 */
@Composable
fun KaribuMark(
    size: Dp = 40.dp,
    color: Color = Cobalt,
    fg: Color = Color.White,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        drawKaribuMark(color = color, fg = fg)
    }
}

private fun DrawScope.drawKaribuMark(color: Color, fg: Color) {
    val w = size.width
    val s = w / 100f   // scale factor — original art is 100×100
    val r = w * 0.22f  // corner radius — matches the SVG default

    // Rounded square background
    drawRoundRect(
        color = color,
        cornerRadius = CornerRadius(r, r),
        size = Size(w, w),
    )

    // k vertical stem: rect x=22 y=22 w=11 h=56
    drawRoundRect(
        color = fg,
        topLeft = Offset(22f * s, 22f * s),
        size = Size(11f * s, 56f * s),
        cornerRadius = CornerRadius(2f * s, 2f * s),
    )

    // k diagonal — path 33 50 → 55 28 → 68 28 → 46 50 → 68 78 → 55 78 → 33 56 Z
    val kPath = Path().apply {
        moveTo(33f * s, 50f * s)
        lineTo(55f * s, 28f * s)
        lineTo(68f * s, 28f * s)
        lineTo(46f * s, 50f * s)
        lineTo(68f * s, 78f * s)
        lineTo(55f * s, 78f * s)
        lineTo(33f * s, 56f * s)
        close()
    }
    drawPath(path = kPath, color = fg)

    // + (small, top-right): vertical bar 68,18 w=8 h=22
    drawRoundRect(
        color = fg,
        topLeft = Offset(68f * s, 18f * s),
        size = Size(8f * s, 22f * s),
        cornerRadius = CornerRadius(1.5f * s, 1.5f * s),
    )
    // + horizontal bar 61,25 w=22 h=8
    drawRoundRect(
        color = fg,
        topLeft = Offset(61f * s, 25f * s),
        size = Size(22f * s, 8f * s),
        cornerRadius = CornerRadius(1.5f * s, 1.5f * s),
    )
}

/** KaribuEHR wordmark — matches web branding. */
@Composable
fun KaribuWordmark(
    height: androidx.compose.ui.unit.Dp = 28.dp,
    color: Color = Cobalt,
    onDark: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val sp = with(androidx.compose.ui.platform.LocalDensity.current) { height.toSp() }
    Text(
        modifier = modifier,
        text = "KaribuEHR",
        fontWeight = FontWeight.SemiBold,
        fontSize = sp,
        letterSpacing = (-0.025f).sp,
        lineHeight = sp,
        color = if (onDark) Color.White else color,
    )
}

/** Mark + wordmark, side by side. */
@Composable
fun KaribuLockup(
    size: Dp = 36.dp,
    color: Color = Cobalt,
    fg: Color = Color.White,
    onDark: Boolean = false,
    textColor: Color = Slate,
    modifier: Modifier = Modifier,
) {
    val markColor = if (onDark) Color.White else color
    val markFg = if (onDark) Cobalt else fg
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        KaribuMark(size = size, color = markColor, fg = markFg)
        KaribuWordmark(height = size * 0.7f, color = textColor, onDark = onDark)
    }
}
