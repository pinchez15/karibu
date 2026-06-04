package com.karibuhealth.app.ui.learn

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.theme.MonoFamily
import com.karibuhealth.app.ui.theme.KaribuMark

/**
 * Shared KaribuLearn UI primitives — the coral counterpart to the EHR's chrome.
 * They follow the Karibu vocabulary: subtle 1px borders, pill radii, mono
 * uppercased eyebrows, no heavy shadow. Mirrors karibu-learn/kl-ui.jsx.
 */

/** Uppercase mono eyebrow (STEP 2 OF 3, CHIEF COMPLAINT, …). */
@Composable
fun Eyebrow(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = LocalKl.current.muted,
) {
    Text(
        text = text.uppercase(),
        modifier = modifier,
        fontFamily = MonoFamily,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
        color = color,
    )
}

/** Mono meta string (IDs, timestamps, ages) — like the EHR. */
@Composable
fun MonoMeta(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = LocalKl.current.muted,
    size: Int = 12,
) {
    Text(
        text = text,
        modifier = modifier,
        fontFamily = MonoFamily,
        fontSize = size.sp,
        letterSpacing = 0.2.sp,
        color = color,
    )
}

enum class KlBtnKind { Primary, Deep, Ghost, Soft, OnDark, GhostDark }

@Composable
fun KlButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: KlBtnKind = KlBtnKind.Primary,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val kl = LocalKl.current
    val (bg, fg, border) = when (kind) {
        KlBtnKind.Primary -> Triple(SolidColor(kl.primary), Color.White, null)
        KlBtnKind.Deep -> Triple(SolidColor(kl.deep), Color.White, null)
        KlBtnKind.Ghost -> Triple(SolidColor(kl.surface), kl.ink, kl.line)
        KlBtnKind.Soft -> Triple(SolidColor(kl.soft), kl.deep, kl.primary.copy(alpha = 0.13f))
        KlBtnKind.OnDark -> Triple(SolidColor(Color.White), kl.deep, null)
        KlBtnKind.GhostDark -> Triple(
            SolidColor(Color.White.copy(alpha = 0.14f)), Color.White, Color.White.copy(alpha = 0.30f),
        )
    }
    val alpha = if (enabled) 1f else 0.55f
    val shape = RoundedCornerShape(11.dp)
    Row(
        modifier = modifier
            .clip(shape)
            .then(if (border != null) Modifier.border(1.dp, border.copy(alpha = border.alpha * alpha), shape) else Modifier)
            .background(brush = bg, shape = shape, alpha = alpha)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 13.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leadingIcon?.let { Icon(it, null, tint = fg.copy(alpha = alpha), modifier = Modifier.size(18.dp)) }
        Text(text, color = fg.copy(alpha = alpha), fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        trailingIcon?.let { Icon(it, null, tint = fg.copy(alpha = alpha), modifier = Modifier.size(18.dp)) }
    }
}

@Composable
fun KlPill(
    text: String,
    color: Color,
    bg: Color,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leadingIcon?.let { Icon(it, null, tint = color, modifier = Modifier.size(13.dp)) }
        Text(text, color = color, fontWeight = FontWeight.SemiBold, fontSize = 11.5f.sp)
    }
}

/** Surface card — bg-surface + 1px line + radius 14. */
@Composable
fun KlCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    borderColor: Color = LocalKl.current.line,
    background: Color = LocalKl.current.surface,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(background)
            .border(1.dp, borderColor, shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(contentPadding),
    ) { content() }
}

/** Thin progress bar (case progress, topic coverage). */
@Composable
fun KlProgressBar(
    value: Float,
    modifier: Modifier = Modifier,
    height: Dp = 6.dp,
    track: Color = LocalKl.current.line,
    fill: Color = LocalKl.current.primary,
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(999.dp))
            .background(track),
    ) {
        Box(
            Modifier
                .fillMaxWidth(value.coerceIn(0f, 1f))
                .height(height)
                .clip(RoundedCornerShape(999.dp))
                .background(fill),
        )
    }
}

enum class KlTagTone { Neutral, Coral, Green }

@Composable
fun KlTag(text: String, tone: KlTagTone = KlTagTone.Neutral, modifier: Modifier = Modifier) {
    val kl = LocalKl.current
    val green = com.karibuhealth.app.ui.theme.Green
    val (fg, line, bg) = when (tone) {
        KlTagTone.Neutral -> Triple(kl.muted, kl.line, Color.Transparent)
        KlTagTone.Coral -> Triple(kl.deep, kl.primary.copy(alpha = 0.25f), kl.soft)
        KlTagTone.Green -> Triple(green, green.copy(alpha = 0.25f), com.karibuhealth.app.ui.theme.GreenSoft)
    }
    Text(
        text = text.uppercase(),
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .border(1.dp, line, RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        fontFamily = MonoFamily,
        fontSize = 10.5f.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.6.sp,
        color = fg,
    )
}

/** "Karibu.learn" wordmark — bold Karibu + a light suffix. */
@Composable
fun KlWordmark(
    height: Dp,
    color: Color,
    suffix: String = ".learn",
    suffixColor: Color? = null,
    modifier: Modifier = Modifier,
) {
    val sp = with(androidx.compose.ui.platform.LocalDensity.current) { height.toSp() }
    Text(
        modifier = modifier,
        text = buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = color)) { append("Karibu") }
            withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = suffixColor ?: color.copy(alpha = 0.62f))) {
                append(suffix)
            }
        },
        fontSize = sp,
        letterSpacing = (-0.025f).sp,
        lineHeight = sp,
    )
}

/**
 * Mark + wordmark lockup. [markFg] is the knockout colour of the "k+" glyph —
 * pass it whenever [markColor] is white (mark on a coloured hero) so the glyph
 * stays visible instead of collapsing to a white block.
 */
@Composable
fun KlLockup(
    size: Dp,
    markColor: Color,
    markFg: Color = Color.White,
    textColor: Color,
    suffix: String = ".learn",
    suffixColor: Color? = null,
    modifier: Modifier = Modifier,
) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        KaribuMark(size = size, color = markColor, fg = markFg)
        KlWordmark(height = size * 0.66f, color = textColor, suffix = suffix, suffixColor = suffixColor)
    }
}

/** Truncating single-line text helper used across cards. */
@Composable
fun OneLine(
    text: String,
    color: Color,
    fontSize: Int,
    fontWeight: FontWeight = FontWeight.Normal,
    modifier: Modifier = Modifier,
) {
    Text(
        text,
        modifier = modifier,
        color = color,
        fontSize = fontSize.sp,
        fontWeight = fontWeight,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        letterSpacing = (-0.01f).sp,
    )
}

// Re-exported EHR cobalt tokens used by the coach/landing where it references
// the patient avatar etc. Kept as a thin alias so screen code reads cleanly.
internal val cobalt: Color get() = com.karibuhealth.app.ui.theme.Cobalt
internal val cobaltSoft: Color get() = com.karibuhealth.app.ui.theme.CobaltSoft

/** Border stroke helper for dashed "coming soon" affordances. */
internal fun dashedLine(color: Color): BorderStroke = BorderStroke(1.dp, color)
