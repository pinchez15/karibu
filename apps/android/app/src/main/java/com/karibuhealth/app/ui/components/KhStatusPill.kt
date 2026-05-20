package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.GreenSoft

/** Karibu status pill — mirrors the web `<StatusPill>` component.
 *
 *  Clinical-note states (Draft / PendingReview / Signed / Cosigned / Addended /
 *  Amended / Errored / Voided) extend the older queue-style kinds (Waiting,
 *  Vitals, etc.). Pill colors come from the M3 colorScheme so both light and
 *  dark renders read correctly.
 */
enum class KhStatusKind {
    // Queue / worklist kinds (legacy, still used by Today + worklists).
    Waiting,
    Vitals,
    Ready,
    InNote,
    Urgent,
    Done,
    Lab,
    Review,
    Sent,
    // Clinical-note lifecycle kinds.
    Draft,
    PendingReview,
    Signed,
    Cosigned,
    Addended,
    Amended,
    Errored,
    Voided,
}

@Composable
fun KhStatusPill(
    kind: KhStatusKind,
    label: String,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val isDark = isSystemInDarkTheme()

    // Dark-mode green: the brand greens are tuned for light surfaces only, so
    // derive a high-contrast pair from the palette when in night mode.
    val successFg = if (isDark) Color(0xFF8DEABF) else Green
    val successBg = if (isDark) Color(0xFF14432F) else GreenSoft

    val (fg, bg) = when (kind) {
        KhStatusKind.Urgent -> scheme.tertiary to scheme.tertiaryContainer
        KhStatusKind.Vitals -> successFg to successBg
        KhStatusKind.InNote -> scheme.primary to scheme.primaryContainer
        KhStatusKind.Ready -> scheme.primary to scheme.primaryContainer
        KhStatusKind.Waiting -> scheme.onSurfaceVariant to scheme.surfaceVariant
        KhStatusKind.Done -> scheme.onSurfaceVariant to scheme.surfaceVariant
        KhStatusKind.Lab -> scheme.secondary to scheme.secondaryContainer
        KhStatusKind.Review -> scheme.primary to scheme.primaryContainer
        KhStatusKind.Sent -> successFg to successBg

        // Clinical-note lifecycle. Kept distinct from the queue kinds so callers
        // express intent at the call site even though some pairs visually match.
        KhStatusKind.Draft -> scheme.onSurfaceVariant to scheme.surfaceVariant
        KhStatusKind.PendingReview -> scheme.primary to scheme.primaryContainer
        KhStatusKind.Signed -> successFg to successBg
        KhStatusKind.Cosigned -> successFg to successBg
        KhStatusKind.Addended -> scheme.tertiary to scheme.tertiaryContainer
        KhStatusKind.Amended -> scheme.tertiary to scheme.tertiaryContainer
        KhStatusKind.Errored -> scheme.error to scheme.errorContainer
        KhStatusKind.Voided -> scheme.error to scheme.errorContainer
    }

    Text(
        text = label,
        color = fg,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    )
}

@Composable
fun KhAccentPill(
    label: String,
    fg: Color,
    bg: Color,
    modifier: Modifier = Modifier,
    paddingValues: PaddingValues = PaddingValues(horizontal = 10.dp, vertical = 3.dp),
) {
    Text(
        text = label,
        color = fg,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(paddingValues),
    )
}
