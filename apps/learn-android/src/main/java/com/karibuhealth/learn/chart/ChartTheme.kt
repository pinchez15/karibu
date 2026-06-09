package com.karibuhealth.learn.chart

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Cobalt chart tokens mirrored from Karibu EHR (simulated chart inside cases). */
val Cobalt = Color(0xFF1F36C7)
val CobaltDeep = Color(0xFF15259A)
val CobaltSoft = Color(0xFFE8ECFB)
val CobaltInk = Color(0xFF0B1452)
val Amber = Color(0xFFF5A524)
val AmberSoft = Color(0xFFFDF1D8)
val AmberInk = Color(0xFF7A4A00)
val Green = Color(0xFF0E8A5F)
val GreenSoft = Color(0xFFDCF1E7)
val Red = Color(0xFFC8362B)
val RedSoft = Color(0xFFFBE5E2)
val Ink = Color(0xFF0E1530)
val Body = Color(0xFF3A4256)
val Muted = Color(0xFF6B7385)
val Line = Color(0xFFE5E7EE)
val LineSoft = Color(0xFFEFF1F6)
val Bg = Color(0xFFF7F8FB)
val Surface = Color(0xFFFFFFFF)

val MonoFamily = FontFamily.Monospace

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
    val s = w / 100f
    val r = w * 0.22f
    drawRoundRect(color = color, cornerRadius = CornerRadius(r, r), size = Size(w, w))
    drawRoundRect(
        color = fg,
        topLeft = Offset(22f * s, 22f * s),
        size = Size(11f * s, 56f * s),
        cornerRadius = CornerRadius(2f * s, 2f * s),
    )
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
    drawRoundRect(
        color = fg,
        topLeft = Offset(68f * s, 18f * s),
        size = Size(8f * s, 22f * s),
        cornerRadius = CornerRadius(1.5f * s, 1.5f * s),
    )
    drawRoundRect(
        color = fg,
        topLeft = Offset(61f * s, 25f * s),
        size = Size(22f * s, 8f * s),
        cornerRadius = CornerRadius(1.5f * s, 1.5f * s),
    )
}
