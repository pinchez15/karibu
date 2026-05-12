package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
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
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.AmberSoft
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.GreenSoft
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.LineSoft
import com.karibuhealth.app.ui.theme.Slate
import com.karibuhealth.app.ui.theme.SlateSoft

/** Karibu status pill — mirrors the web `<StatusPill>` component. */
enum class KhStatusKind { Waiting, Vitals, Ready, InNote, Urgent, Done, Lab, Review, Sent }

@Composable
fun KhStatusPill(
    kind: KhStatusKind,
    label: String,
    modifier: Modifier = Modifier,
) {
    val (fg, bg) = when (kind) {
        KhStatusKind.Urgent -> Amber to AmberSoft
        KhStatusKind.Vitals -> Green to GreenSoft
        KhStatusKind.InNote -> Cobalt to CobaltSoft
        KhStatusKind.Ready -> Cobalt to CobaltSoft
        KhStatusKind.Waiting -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.surfaceVariant
        KhStatusKind.Done -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.surfaceVariant
        KhStatusKind.Lab -> Slate to SlateSoft
        KhStatusKind.Review -> Cobalt to CobaltSoft
        KhStatusKind.Sent -> Green to GreenSoft
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
