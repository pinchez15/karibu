package com.karibuhealth.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.MonoFamily

/**
 * Focus-aware vital input card.
 *
 * - Renders a small uppercase label + a large mono value + unit.
 * - When focused: cobalt 2-px border + soft cobalt halo.
 * - When `hot` (out-of-range): amber border + amber value text.
 *
 * Backed by the system numeric keyboard. Focus state styles the border, but
 * the actual numeric keypad is whatever the OS provides for KeyboardType.Decimal.
 */
@Composable
fun KhVitalCard(
    label: String,
    value: String,
    unit: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    decimal: Boolean = false,
    hot: Boolean = false,
    imeAction: ImeAction = ImeAction.Next,
) {
    var isFocused by rememberSaveable { mutableStateOf(false) }

    val borderColor: Color = when {
        isFocused -> Cobalt
        hot -> Amber
        else -> Line
    }
    val labelColor: Color = if (isFocused) Cobalt else MaterialTheme.colorScheme.onSurfaceVariant
    val valueColor: Color = if (hot) Amber else MaterialTheme.colorScheme.onSurface

    val borderWidth = if (isFocused) 2.dp else 1.dp
    val haloModifier = if (isFocused) {
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(CobaltSoft)
            .padding(4.dp)
    } else {
        Modifier
    }

    Box(modifier = modifier.then(haloModifier)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(borderWidth, borderColor, RoundedCornerShape(12.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Column {
                Text(
                    text = label.uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.6.sp),
                    color = labelColor,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    BasicTextField(
                        value = value,
                        onValueChange = { input ->
                            // Drop anything that isn't a digit (or a decimal point if allowed).
                            val sanitized = input.filter { c ->
                                c.isDigit() || (decimal && c == '.')
                            }
                            onValueChange(sanitized)
                        },
                        textStyle = TextStyle(
                            color = valueColor,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.SemiBold,
                            // Reserved mono + tabular figures: the vital value is the
                            // most safety-relevant number, so digits must align.
                            fontFamily = MonoFamily,
                            fontFeatureSettings = "tnum",
                        ),
                        cursorBrush = SolidColor(Cobalt),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number,
                            imeAction = imeAction,
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .onFocusChanged { isFocused = it.isFocused },
                        decorationBox = { inner ->
                            if (value.isEmpty()) {
                                Text(
                                    text = "—",
                                    style = LocalTextStyle.current.copy(
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 22.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    ),
                                )
                            }
                            inner()
                        },
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = unit,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                }
            }
        }
    }
}
