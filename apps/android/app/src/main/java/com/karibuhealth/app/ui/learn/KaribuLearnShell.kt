package com.karibuhealth.app.ui.learn

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.theme.KaribuMark
import com.karibuhealth.app.ui.theme.MonoFamily

/** A coral hero box: gradient fill + a soft radial highlight, rounded. */
@Composable
fun CoralHero(
    modifier: Modifier = Modifier,
    radius: Int = 16,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val kl = LocalKl.current
    val shape = RoundedCornerShape(radius.dp)
    Box(
        modifier
            .clip(shape)
            .background(kl.gradient())
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        // Top-right glow
        Box(
            Modifier.fillMaxWidth().height(200.dp).background(
                Brush.radialGradient(
                    listOf(Color.White.copy(alpha = 0.20f), Color.Transparent),
                    center = Offset(700f, 0f), radius = 460f,
                ),
            ),
        )
        content()
    }
}

enum class LearnTab(val label: String, val icon: ImageVector) {
    Home("Home", KlIcons.home),
    Library("Cases", KlIcons.cases),
    Progress("Progress", KlIcons.award),
    About("About", KlIcons.info),
}

@Composable
fun KlTabBar(active: LearnTab, onSelect: (LearnTab) -> Unit) {
    val kl = LocalKl.current
    Column {
        Box(Modifier.fillMaxWidth().height(1.dp).background(kl.line))
        Row(Modifier.fillMaxWidth().background(kl.surface).padding(bottom = 12.dp)) {
            LearnTab.entries.forEach { tab ->
                val on = tab == active
                Column(
                    Modifier.weight(1f).clickable { onSelect(tab) }.padding(top = 9.dp, bottom = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Icon(tab.icon, tab.label, tint = if (on) kl.primary else kl.muted, modifier = Modifier.size(22.dp))
                    Text(tab.label, fontSize = 10.5f.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                        color = if (on) kl.primary else kl.muted)
                }
            }
        }
    }
}

/** Standard coral app bar for the tabbed screens. */
@Composable
fun KlAppBar(title: String, sub: String? = null, showMark: Boolean = false, trailing: (@Composable () -> Unit)? = null) {
    val kl = LocalKl.current
    Column {
        Row(
            Modifier.fillMaxWidth().background(kl.surface).padding(horizontal = 18.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (showMark) KaribuMark(size = 26.dp, color = kl.primary)
                Column {
                    sub?.let { Eyebrow(it, color = kl.muted) }
                    Text(title, color = kl.ink, fontWeight = FontWeight.Bold,
                        fontSize = if (showMark) 16.sp else 20.sp, letterSpacing = (-0.02f).sp)
                }
            }
            trailing?.invoke()
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(kl.lineSoft))
    }
}

/** Horizontal case row used in Home + Library. */
@Composable
fun CaseCard(case: LearnCase, onOpen: (LearnCase) -> Unit) {
    val kl = LocalKl.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(kl.surface)
            .border(1.dp, kl.line, RoundedCornerShape(14.dp)).clickable { onOpen(case) }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(52.dp).clip(RoundedCornerShape(12.dp))
                .then(if (case.ready) Modifier.background(kl.gradient()) else Modifier.background(kl.soft)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(KlIcons.stethoscope, null, tint = if (case.ready) Color.White else kl.primary, modifier = Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(case.topic.uppercase(), fontFamily = MonoFamily, fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.5.sp, color = kl.muted)
                sourceLabel(case)?.let { label ->
                    Text(label, fontFamily = MonoFamily, fontSize = 8.5f.sp, fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.4.sp, color = kl.deep,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(kl.soft)
                            .padding(horizontal = 5.dp, vertical = 1.dp))
                }
                if (!case.ready) {
                    Text("SOON", fontFamily = MonoFamily, fontSize = 8.5f.sp, color = kl.muted,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, kl.line, RoundedCornerShape(4.dp))
                            .padding(horizontal = 5.dp, vertical = 1.dp))
                }
            }
            Spacer(Modifier.height(3.dp))
            OneLine(case.title, color = kl.ink, fontSize = 14, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    Icon(KlIcons.clock, null, tint = kl.muted, modifier = Modifier.size(12.dp))
                    MonoMeta("${case.mins}m", color = kl.muted, size = 10)
                }
                MonoMeta("· CME ${fmtCredit(case.credit)}", color = kl.muted, size = 10)
            }
        }
        if (case.ready) Icon(KlIcons.play, null, tint = kl.primary, modifier = Modifier.size(16.dp))
    }
}

/** Loading + error placeholders that match the coral chrome. */
@Composable
fun KlCentered(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

internal fun fmtCredit(credit: Double): String =
    if (credit == credit.toLong().toDouble()) credit.toLong().toString() else credit.toString()

/**
 * Short mono tag for a case's source/mode. The content strategy deliberately
 * avoids a "real vs generated" hierarchy — these label *how the case is framed*
 * (guideline practice, challenge, conference), not its quality.
 */
internal fun sourceLabel(case: LearnCase): String? = when {
    case.sourceType?.contains("Literature", true) == true -> "LITERATURE"
    case.sourceType?.contains("Conference", true) == true || case.mode?.contains("Conference", true) == true -> "CONFERENCE"
    case.sourceType?.contains("Challenge", true) == true || case.mode?.contains("Challenge", true) == true -> "CHALLENGE"
    case.sourceType?.contains("Guideline", true) == true -> "GUIDELINE"
    case.mode != null -> case.mode.substringBefore(' ').uppercase()
    else -> null
}
