package com.karibuhealth.app.ui.learn

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.MonoFamily

@Composable
fun CaseLandingScreen(case: LearnCase, onBegin: (LearnCase) -> Unit, onBack: () -> Unit) {
    val kl = LocalKl.current
    BackHandler(onBack = onBack)
    Column(Modifier.fillMaxSize().background(kl.bg)) {
        // Hero
        Box(Modifier.fillMaxWidth().then(if (case.ready) Modifier.background(kl.gradient()) else Modifier.background(kl.deep))) {
            Column(Modifier.padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 22.dp)) {
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(Color.White.copy(alpha = 0.16f))
                    .clickable(onClick = onBack), contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    HeroTag(case.topic)
                    HeroTag(case.difficulty)
                    case.sourceType?.let { HeroTag(it) }
                }
                Spacer(Modifier.height(10.dp))
                Text(case.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 25.sp, lineHeight = 28.sp,
                    letterSpacing = (-0.025f).sp)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Icon(KlIcons.clock, null, tint = Color.White.copy(alpha = 0.92f), modifier = Modifier.size(13.dp))
                        MonoMeta("${case.mins} min", color = Color.White.copy(alpha = 0.92f), size = 11)
                    }
                    MonoMeta("· CME ${fmtCredit(case.credit)}", color = Color.White.copy(alpha = 0.92f), size = 11)
                }
            }
        }

        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp)) {
            if (case.blurb.isNotBlank()) {
                Text(case.blurb, color = kl.body, fontSize = 14.sp, lineHeight = 22.sp)
                Spacer(Modifier.height(20.dp))
            }

            // Patient
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(kl.surface)
                .border(1.dp, kl.line, RoundedCornerShape(14.dp)).padding(14.dp)) {
                Text("YOUR PATIENT", fontFamily = MonoFamily, fontSize = 9.5f.sp, letterSpacing = 0.6.sp, color = kl.muted)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                    val initials = case.patient.name.split(" ").mapNotNull { it.firstOrNull() }.take(2).joinToString("").uppercase()
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(11.dp)).background(CobaltSoft), contentAlignment = Alignment.Center) {
                        Text(initials, color = Cobalt, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                    Column {
                        Text(case.patient.name, color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        MonoMeta("${case.patient.id?.let { "$it · " } ?: ""}${case.patient.age}", color = kl.muted, size = 11)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(kl.wash).padding(horizontal = 11.dp, vertical = 9.dp)) {
                    Text("Generated patient — invented for teaching, never a real record.", color = kl.muted, fontSize = 11.5f.sp, lineHeight = 16.sp)
                }
            }
            Spacer(Modifier.height(20.dp))

            if (case.objectives.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Icon(KlIcons.target, null, tint = kl.primary, modifier = Modifier.size(18.dp))
                    Text("You'll be able to…", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 14.5f.sp)
                }
                Spacer(Modifier.height(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    case.objectives.forEachIndexed { i, o ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.size(20.dp).clip(RoundedCornerShape(999.dp)).background(kl.soft), contentAlignment = Alignment.Center) {
                                Text("${i + 1}", fontFamily = MonoFamily, fontSize = 10.5f.sp, fontWeight = FontWeight.Bold, color = kl.deep)
                            }
                            Text(o, color = kl.body, fontSize = 13.5f.sp, lineHeight = 19.sp)
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        // Pinned CTA
        Box(Modifier.fillMaxWidth().height(1.dp).background(kl.line))
        Box(Modifier.fillMaxWidth().background(kl.surface).padding(18.dp)) {
            if (case.ready) {
                KlButton("Begin case", { onBegin(case) }, Modifier.fillMaxWidth(), leadingIcon = KlIcons.play)
            } else {
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .border(1.dp, kl.line, RoundedCornerShape(12.dp)).padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
                    Text("COMING SOON", fontFamily = MonoFamily, fontSize = 12.sp, letterSpacing = 0.6.sp, color = kl.muted)
                }
            }
        }
    }
}

@Composable
private fun HeroTag(text: String) {
    Text(
        text.uppercase(), fontFamily = MonoFamily, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp,
        color = Color.White,
        modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(Color.White.copy(alpha = 0.18f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun CaseCompleteScreen(case: LearnCase, score: Int, total: Int, onLibrary: () -> Unit) {
    val kl = LocalKl.current
    val pct = if (total > 0) (score * 100 / total) else 0
    BackHandler(onBack = onLibrary)
    Column(Modifier.fillMaxSize().background(kl.bg).verticalScroll(rememberScrollState())) {
        // Header
        Box(Modifier.fillMaxWidth().background(kl.gradient())) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(50.dp).clip(RoundedCornerShape(999.dp)).background(Color.White.copy(alpha = 0.22f)), contentAlignment = Alignment.Center) {
                    Icon(KlIcons.award, null, tint = Color.White, modifier = Modifier.size(26.dp))
                }
                Spacer(Modifier.height(12.dp))
                Text("CASE COMPLETE", fontFamily = MonoFamily, fontSize = 10.sp, letterSpacing = 1.sp, color = Color.White.copy(alpha = 0.85f))
                Spacer(Modifier.height(6.dp))
                Text(case.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp, textAlign = TextAlign.Center,
                    letterSpacing = (-0.02f).sp)
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(26.dp)) {
                    CompleteStat("$score/$total", "RIGHT")
                    CompleteStat("$pct%", "ACCURACY")
                    CompleteStat("+${fmtCredit(case.credit)}", "CME")
                }
            }
        }

        Column(Modifier.padding(18.dp)) {
            if (case.takeaways.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Icon(KlIcons.bulb, null, tint = kl.primary, modifier = Modifier.size(16.dp))
                    Text("Key takeaways", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
                Spacer(Modifier.height(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    case.takeaways.forEach { t ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(kl.surface)
                                .border(1.dp, kl.line, RoundedCornerShape(12.dp)).padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(KlIcons.check, null, tint = Green, modifier = Modifier.size(16.dp).padding(top = 1.dp))
                            Text(t, color = kl.body, fontSize = 13.sp, lineHeight = 19.sp)
                        }
                    }
                }
            }

            if (case.citations.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                Text("BASED ON", fontFamily = MonoFamily, fontSize = 10.sp, letterSpacing = 0.5.sp, color = kl.muted)
                Spacer(Modifier.height(8.dp))
                Text(case.citations.joinToString("\n") { "· $it" }, fontFamily = MonoFamily, fontSize = 11.5f.sp,
                    color = kl.muted, lineHeight = 19.sp)
            }

            Spacer(Modifier.height(20.dp))
            KlButton("Back to library", onLibrary, Modifier.fillMaxWidth(), trailingIcon = KlIcons.arrowRight)
            if (case.share != null) {
                Spacer(Modifier.height(10.dp))
                ShareCaseButton(case, Modifier.fillMaxWidth())
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun CompleteStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 24.sp, letterSpacing = (-0.02f).sp)
        Text(label, fontFamily = MonoFamily, fontSize = 9.sp, letterSpacing = 0.5.sp, color = Color.White.copy(alpha = 0.82f))
    }
}
