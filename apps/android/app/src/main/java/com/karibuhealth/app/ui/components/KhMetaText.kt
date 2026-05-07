package com.karibuhealth.app.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.theme.Muted

/**
 * Small uppercase mono label — the Android equivalent of the web `.kh-meta`
 * utility. Used for section labels, step indicators, and metadata rows.
 */
@Composable
fun KhMetaText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Muted,
) {
    Text(
        text = text.uppercase(),
        modifier = modifier,
        style = MaterialTheme.typography.labelSmall.copy(
            fontFamily = MaterialTheme.typography.labelSmall.fontFamily,
            letterSpacing = 0.6.sp,
        ),
        fontWeight = FontWeight.SemiBold,
        color = color,
    )
}
