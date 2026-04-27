package com.karibuhealth.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

// Karibu Health brand colors — derived from logo (#1E3BAA)
val KaribuBlue = Color(0xFF1E3BAA)
val KaribuBlueDark = Color(0xFF152A7A)
val KaribuBlueLight = Color(0xFF7B8DD9)
val KaribuBlueContainer = Color(0xFFE8EBF7)
val KaribuGreen = Color(0xFF16A34A)
val KaribuBackground = Color(0xFFF9FAFB)
val KaribuSurface = Color(0xFFFFFFFF)
val KaribuError = Color(0xFFDC2626)
val KaribuWarning = Color(0xFFF59E0B)

private val LightColorScheme = lightColorScheme(
    primary = KaribuBlue,
    onPrimary = Color.White,
    primaryContainer = KaribuBlueContainer,
    onPrimaryContainer = KaribuBlueDark,
    secondary = KaribuGreen,
    onSecondary = Color.White,
    background = KaribuBackground,
    surface = KaribuSurface,
    error = KaribuError,
    onError = Color.White,
    onBackground = Color(0xFF111827),
    onSurface = Color(0xFF111827),
    outline = Color(0xFFD1D5DB),
    surfaceVariant = Color(0xFFF3F4F6),
)

private val DarkColorScheme = darkColorScheme(
    primary = KaribuBlueLight,
    onPrimary = Color(0xFF0B1556),
    primaryContainer = KaribuBlueDark,
    onPrimaryContainer = KaribuBlueContainer,
    secondary = Color(0xFF4ADE80),
    onSecondary = Color(0xFF003D1A),
    background = Color(0xFF111827),
    surface = Color(0xFF1F2937),
    error = Color(0xFFFCA5A5),
    onError = Color(0xFF7F1D1D),
    onBackground = Color(0xFFF9FAFB),
    onSurface = Color(0xFFF9FAFB),
    outline = Color(0xFF4B5563),
    surfaceVariant = Color(0xFF374151),
)

@Composable
fun KaribuHealthTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = content,
    )
}
