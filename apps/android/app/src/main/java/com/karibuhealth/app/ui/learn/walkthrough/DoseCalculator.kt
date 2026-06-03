package com.karibuhealth.app.ui.learn.walkthrough

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.learn.KlIcons
import com.karibuhealth.app.ui.learn.MonoMeta
import com.karibuhealth.app.ui.learn.model.DoseCalcSpec
import com.karibuhealth.app.ui.theme.Bg
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltInk
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.MonoFamily
import com.karibuhealth.app.ui.theme.Muted
import com.karibuhealth.app.ui.theme.Red
import com.karibuhealth.app.ui.theme.Surface
import kotlin.math.roundToInt

/**
 * Weight-based dose calculator — a faithful cobalt KaribuEHR tool, presented as
 * a bottom sheet. Adjust the patient's weight and the WHO weight band +
 * tablets-per-dose recompute live. Driven entirely by [DoseCalcSpec] so any
 * case (any drug) can open the same calculator.
 */
@Composable
fun DoseCalculatorSheet(
    spec: DoseCalcSpec,
    onClose: () -> Unit,
    onUse: ((tabs: Int, total: Int) -> Unit)? = null,
) {
    Box(
        Modifier.fillMaxSize().background(CobaltInk.copy(alpha = 0.42f)).clickable(onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(0.94f).clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .background(Surface)
                .clickable(enabled = false) {}, // swallow taps so the scrim doesn't close it
        ) {
            // Cobalt header + grabber
            Column(Modifier.fillMaxWidth().background(CobaltInk).padding(horizontal = 16.dp).padding(top = 10.dp, bottom = 13.dp)) {
                Box(Modifier.align(Alignment.CenterHorizontally).padding(bottom = 12.dp)
                    .size(width = 36.dp, height = 4.dp).clip(RoundedCornerShape(999.dp)).background(Color.White.copy(alpha = 0.3f)))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Box(Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.14f)),
                        contentAlignment = Alignment.Center) {
                        Icon(KlIcons.calc, null, tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text("Dose calculator", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.5f.sp)
                        Text("KARIBUEHR · WEIGHT-BASED", fontFamily = MonoFamily, fontSize = 9.sp,
                            letterSpacing = 0.5.sp, color = Color.White.copy(alpha = 0.6f))
                    }
                    Box(Modifier.size(26.dp).clip(RoundedCornerShape(7.dp)).background(Color.White.copy(alpha = 0.12f))
                        .clickable(onClick = onClose), contentAlignment = Alignment.Center) {
                        Icon(KlIcons.close, null, tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
            }

            DoseCalcBody(spec, onClose, onUse, Modifier.weight(1f, fill = false))
        }
    }
}

@Composable
private fun DoseCalcBody(
    spec: DoseCalcSpec,
    onClose: () -> Unit,
    onUse: ((Int, Int) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    var weight by remember { mutableFloatStateOf(spec.startWeight.toFloat()) }
    fun clamp(x: Float) = (((x * 10f).roundToInt()) / 10f).coerceIn(2f, 120f)
    val band = spec.bandFor(weight.toDouble())
    val tabs = band?.tabs ?: 0
    val total = tabs * spec.dosesPerDay * spec.days

    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp)) {
        // Drug strip
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Bg)
                .border(1.dp, Line, RoundedCornerShape(10.dp)).padding(horizontal = 11.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Icon(KlIcons.pill, null, tint = Cobalt, modifier = Modifier.size(18.dp))
            Column {
                Text(spec.drug, color = Ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                MonoMeta(spec.drugSub, color = Muted, size = 9)
            }
        }
        Spacer(Modifier.height(14.dp))

        Text("PATIENT WEIGHT", fontFamily = MonoFamily, fontSize = 9.5f.sp, fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.6.sp, color = Muted)
        Spacer(Modifier.height(7.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            StepperButton(KlIcons.minus) { weight = clamp(weight - 0.5f) }
            Row(
                Modifier.weight(1f).height(46.dp).clip(RoundedCornerShape(12.dp)).background(Bg)
                    .border(1.dp, Line, RoundedCornerShape(12.dp)),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.Bottom,
            ) {
                Box(Modifier.padding(bottom = 8.dp)) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(String.format("%.1f", weight), fontFamily = MonoFamily, fontSize = 26.sp,
                            fontWeight = FontWeight.Bold, color = Ink)
                        Text("kg", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(bottom = 3.dp))
                    }
                }
            }
            StepperButton(KlIcons.plus) { weight = clamp(weight + 0.5f) }
        }
        Spacer(Modifier.height(10.dp))
        Slider(
            value = weight, onValueChange = { weight = clamp(it) }, valueRange = 2f..90f, steps = 175,
            colors = SliderDefaults.colors(thumbColor = Cobalt, activeTrackColor = Cobalt, inactiveTrackColor = Line),
        )
        Spacer(Modifier.height(8.dp))

        // Band grid
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            spec.bands.forEach { b ->
                val on = band != null && b.lo == band.lo
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(9.dp))
                        .background(if (on) CobaltSoft else Surface)
                        .border(1.5.dp, if (on) Cobalt else Line, RoundedCornerShape(9.dp))
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(b.label, fontFamily = MonoFamily, fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                        color = if (on) Cobalt else Muted)
                    Text("${b.tabs}", fontSize = 16.sp, fontWeight = FontWeight.Bold,
                        color = if (on) Cobalt else Body)
                }
            }
        }
        Spacer(Modifier.height(14.dp))

        // Result
        if (band != null) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(CobaltSoft.copy(alpha = 0.4f))
                    .border(1.5.dp, Cobalt, RoundedCornerShape(12.dp)).padding(14.dp),
            ) {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("$tabs tablets", color = Cobalt, fontWeight = FontWeight.Bold, fontSize = 26.sp)
                    Text("per dose", color = Body, fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                        modifier = Modifier.padding(bottom = 3.dp))
                }
                val perDay = if (spec.dosesPerDay == 2) "Twice daily" else "${spec.dosesPerDay}× daily"
                Text("$perDay × ${spec.days} days · $total total", color = Body, fontSize = 12.5f.sp)
            }
        } else {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFFEF3F2))
                    .border(1.5.dp, Red.copy(alpha = 0.33f), RoundedCornerShape(12.dp)).padding(14.dp),
            ) {
                Text("Below ${spec.drug.substringBefore(' ')} range", color = Red, fontWeight = FontWeight.Bold, fontSize = 13.5f.sp)
                Text("For < ${spec.minWeight.toInt()} kg, refer for specialist dosing.", color = Body, fontSize = 12.5f.sp)
            }
        }
        Spacer(Modifier.height(11.dp))
        Text("SOURCE · ${spec.sourceLabel.uppercase()}", fontFamily = MonoFamily, fontSize = 9.5f.sp, color = Muted, lineHeight = 15.sp)
        Spacer(Modifier.height(14.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(
                "Close", color = Body, fontWeight = FontWeight.SemiBold, fontSize = 13.5f.sp,
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(11.dp)).background(Surface)
                    .border(1.dp, Line, RoundedCornerShape(11.dp)).clickable(onClick = onClose)
                    .padding(vertical = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            if (onUse != null) {
                val enabled = band != null
                Text(
                    "Use this dose", color = if (enabled) Color.White else Muted, fontWeight = FontWeight.SemiBold, fontSize = 13.5f.sp,
                    modifier = Modifier.weight(1.4f).clip(RoundedCornerShape(11.dp))
                        .background(if (enabled) Cobalt else Line)
                        .clickable(enabled = enabled) { onUse(tabs, total) }
                        .padding(vertical = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun StepperButton(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(
        Modifier.size(46.dp).clip(RoundedCornerShape(12.dp)).background(Surface)
            .border(1.dp, Line, RoundedCornerShape(12.dp)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = Cobalt, modifier = Modifier.size(18.dp)) }
}
