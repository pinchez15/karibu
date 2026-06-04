package com.karibuhealth.app.ui.learn

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * KaribuLearn coral tokens.
 *
 * KaribuLearn is a distinct product that shares Karibu's bones but never its
 * skin — a clinician with both apps on one phone must not confuse them. The
 * rule, lifted from the design system (karibu-learn/kl-tokens.jsx):
 *
 *   coral  = "KaribuLearn is teaching you"  (brand + the coaching layer)
 *   cobalt = "this is the EHR"              (the simulated KaribuEHR chart)
 *   amber  = "AI is working"               (reserved, inside the EHR only)
 *   red    = "clinical critical finding"   (reserved, inside the EHR only)
 *
 * So: this palette owns the shell (welcome, tabs, library, coach). The cobalt
 * [com.karibuhealth.app.ui.theme] tokens stay true inside a case, where the
 * learner works a faithful copy of the real EHR.
 */
data class KlPalette(
    val primary: Color,
    val bright: Color,
    val deep: Color,
    val soft: Color,
    val wash: Color,
    val gradStart: Color,
    val gradMid: Color,
    val gradEnd: Color,
    // Warm neutrals — a hair warmer than the EHR's cool greys, so the chrome
    // reads like a different room without shouting.
    val ink: Color = Color(0xFF241018),
    val body: Color = Color(0xFF52454B),
    val muted: Color = Color(0xFF8A7B82),
    val line: Color = Color(0xFFEFE6E8),
    val lineSoft: Color = Color(0xFFF6EEF0),
    val bg: Color = Color(0xFFFBF7F8),
    val surface: Color = Color(0xFFFFFFFF),
) {
    /** Diagonal coral hero gradient (≈135°). Used on welcome / hero moments. */
    fun gradient(): Brush = Brush.linearGradient(
        colorStops = arrayOf(0f to gradStart, 0.48f to gradMid, 1f to gradEnd),
        start = Offset(0f, 0f),
        end = Offset(900f, 900f),
    )
}

/**
 * The three coral directions sampled from the brand palette
 * (#FE5C8D rose · #FD4C5C coral · #FC413E vermilion). All are brighter and
 * pinker than the EHR's brick caution-red (#C8362B), so none reads as the
 * clinical alert colour. `Coral` is the shipped default.
 */
enum class CoralSet { Coral, Vermilion, Rose }

val CoralPalette = KlPalette(
    primary = Color(0xFFFB4D5B), bright = Color(0xFFFF7E54), deep = Color(0xFFE12E4E),
    soft = Color(0xFFFFE7EA), wash = Color(0xFFFFF5F4),
    gradStart = Color(0xFFFF8253), gradMid = Color(0xFFFB4D5B), gradEnd = Color(0xFFE5305F),
)

val VermilionPalette = KlPalette(
    primary = Color(0xFFFB5347), bright = Color(0xFFFF8A47), deep = Color(0xFFDC3322),
    soft = Color(0xFFFFE8E2), wash = Color(0xFFFFF6F2),
    gradStart = Color(0xFFFF9A3D), gradMid = Color(0xFFFB5347), gradEnd = Color(0xFFE03522),
)

val RosePalette = KlPalette(
    primary = Color(0xFFFB4E75), bright = Color(0xFFFF7E6E), deep = Color(0xFFDD2C63),
    soft = Color(0xFFFFE7EE), wash = Color(0xFFFFF5F7),
    gradStart = Color(0xFFFF7C5E), gradMid = Color(0xFFFB4E75), gradEnd = Color(0xFFE22F7A),
)

fun coralPaletteFor(set: CoralSet): KlPalette = when (set) {
    CoralSet.Coral -> CoralPalette
    CoralSet.Vermilion -> VermilionPalette
    CoralSet.Rose -> RosePalette
}

/** Ambient coral palette so every KaribuLearn composable can read the accent. */
val LocalKl = staticCompositionLocalOf { CoralPalette }
