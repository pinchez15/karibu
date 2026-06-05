package com.karibuhealth.app.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.ui.theme.MonoFamily

/** Mono key/value vital chip — `T 38.4°C` style (label cool, value bold). */
@Composable
fun KhVitalChip(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(modifier = modifier) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.width(4.dp))
        // The vital VALUE is the most safety-relevant figure — render it in the
        // reserved mono with tabular figures so digits align and a transposition
        // (38.4 vs 34.8) is easier to catch.
        Text(
            text = value,
            style = MaterialTheme.typography.labelMedium.copy(
                fontFamily = MonoFamily,
                fontFeatureSettings = "tnum",
            ),
            color = valueColor,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
