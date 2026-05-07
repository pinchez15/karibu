package com.karibuhealth.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * KH palette mapped onto M3 roles.
 *
 *  M3 role           Karibu intent
 *  ──────────────────────────────────────────────────
 *  primary           Cobalt (brand anchor)
 *  secondary         Slate (chrome / type secondary)
 *  tertiary          Amber (RESERVED — AI moments + urgency only)
 *  error             Red (critical only)
 *  surface*          Bg / Surface / SurfaceVariant
 *  outline*          Line / LineSoft
 */

private val LightColorScheme = lightColorScheme(
    primary = Cobalt,
    onPrimary = Color.White,
    primaryContainer = CobaltSoft,
    onPrimaryContainer = CobaltDeep,

    secondary = Slate,
    onSecondary = Color.White,
    secondaryContainer = SlateSoft,
    onSecondaryContainer = SlateDeep,

    tertiary = Amber,
    onTertiary = AmberInk,
    tertiaryContainer = AmberSoft,
    onTertiaryContainer = AmberInk,

    error = Red,
    onError = Color.White,
    errorContainer = RedSoft,
    onErrorContainer = Red,

    background = Bg,
    onBackground = Ink,
    surface = Surface,
    onSurface = Ink,
    surfaceVariant = LineSoft,
    onSurfaceVariant = Body,
    surfaceTint = Cobalt,

    outline = Line,
    outlineVariant = LineSoft,

    inverseSurface = Ink,
    inverseOnSurface = Bg,
    inversePrimary = DarkPrimary,
    scrim = Color(0xFF000000),
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimary,
    onPrimary = CobaltInk,
    primaryContainer = CobaltDeep,
    onPrimaryContainer = CobaltSoft,

    secondary = Slate,
    onSecondary = Color.White,
    secondaryContainer = SlateDeep,
    onSecondaryContainer = SlateSoft,

    tertiary = DarkAmber,
    onTertiary = AmberInk,
    tertiaryContainer = AmberInk,
    onTertiaryContainer = DarkAmber,

    error = Color(0xFFFF8B82),
    onError = Color(0xFF5C0E07),
    errorContainer = Color(0xFF7A1B11),
    onErrorContainer = Color(0xFFFFD9D5),

    background = DarkBg,
    onBackground = DarkInk,
    surface = DarkSurface,
    onSurface = DarkInk,
    surfaceVariant = DarkSurfaceHi,
    onSurfaceVariant = DarkBody,
    surfaceTint = DarkPrimary,

    outline = DarkLine,
    outlineVariant = DarkLine,

    inverseSurface = DarkInk,
    inverseOnSurface = DarkBg,
    inversePrimary = Cobalt,
    scrim = Color(0xFF000000),
)

@Composable
fun KaribuHealthTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = KaribuTypography,
        content = content,
    )
}
