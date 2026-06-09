package com.karibuhealth.learn

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.learn.data.PackEntry
import com.karibuhealth.learn.data.PackStatus
import com.karibuhealth.learn.model.LearnCase
import com.karibuhealth.learn.model.PackInfo
import com.karibuhealth.learn.chart.Cobalt
import com.karibuhealth.learn.chart.CobaltSoft
import com.karibuhealth.learn.chart.Green
import com.karibuhealth.learn.chart.GreenSoft
import com.karibuhealth.learn.chart.KaribuMark
import com.karibuhealth.learn.chart.MonoFamily

// ── Welcome ──────────────────────────────────────────────────────────────────
@Composable
fun WelcomeScreen(caseCount: Int, topicCount: Int, onEnter: () -> Unit) {
    val kl = LocalKl.current
    Box(Modifier.fillMaxSize().background(kl.gradient())) {
        Column(Modifier.fillMaxSize().padding(horizontal = 26.dp)) {
            Spacer(Modifier.height(26.dp))
            KlLockup(size = 28.dp, markColor = Color.White, markFg = kl.primary, textColor = Color.White,
                suffixColor = Color.White.copy(alpha = 0.72f))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                Text("CME · UGANDA · FREE", fontFamily = MonoFamily, fontSize = 10.5f.sp, fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp, color = Color.White.copy(alpha = 0.85f))
                Spacer(Modifier.height(14.dp))
                Text("See the patient before the patient sees you.", color = Color.White, fontWeight = FontWeight.Bold,
                    fontSize = 34.sp, lineHeight = 37.sp, letterSpacing = (-0.03f).sp)
                Spacer(Modifier.height(16.dp))
                Text("Real HC III cases, written by Ugandan clinicians. Work each one like a live visit. No real patient data.",
                    color = Color.White.copy(alpha = 0.92f), fontSize = 15.sp, lineHeight = 22.sp)
                Spacer(Modifier.height(26.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                    WelcomeStat(if (caseCount > 0) "$caseCount" else "—", "cases")
                    WelcomeStat(if (topicCount > 0) "$topicCount" else "—", "topics")
                    WelcomeStat("CME", "credit")
                }
            }
            Column(Modifier.padding(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                KlButton("Browse cases", onEnter, Modifier.fillMaxWidth(), KlBtnKind.OnDark, trailingIcon = KlIcons.arrowRight)
                KlButton("Continue with phone number", onEnter, Modifier.fillMaxWidth(), KlBtnKind.GhostDark)
                Text("No account needed. Make one later for a CME certificate.",
                    color = Color.White.copy(alpha = 0.78f), fontSize = 11.sp, lineHeight = 16.sp,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
    }
}

@Composable
private fun WelcomeStat(value: String, label: String) {
    Column {
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 24.sp, letterSpacing = (-0.02f).sp)
        Text(label.uppercase(), fontFamily = MonoFamily, fontSize = 9.5f.sp, letterSpacing = 0.5.sp,
            color = Color.White.copy(alpha = 0.8f))
    }
}

// ── Home ─────────────────────────────────────────────────────────────────────
@Composable
fun HomeScreen(cases: List<LearnCase>, onOpenCase: (LearnCase) -> Unit, onSeeAll: () -> Unit) {
    val kl = LocalKl.current
    val feature = cases.firstOrNull { it.ready } ?: cases.firstOrNull()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 16.dp)) {
        feature?.let { f ->
            CoralHero(onClick = { onOpenCase(f) }) {
                Column(Modifier.padding(18.dp)) {
                    Text("CONTINUE LEARNING", fontFamily = MonoFamily, fontSize = 9.5f.sp, letterSpacing = 0.7.sp,
                        color = Color.White.copy(alpha = 0.85f))
                    Spacer(Modifier.height(8.dp))
                    Text(f.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 25.sp,
                        letterSpacing = (-0.02f).sp)
                    Spacer(Modifier.height(14.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            Modifier.clip(RoundedCornerShape(9.dp)).background(Color.White).padding(horizontal = 14.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(KlIcons.play, null, tint = kl.deep, modifier = Modifier.size(14.dp))
                            Text(if (f.ready) "Start" else "Preview", color = kl.deep, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                        MonoMeta("${f.mins} min · CME ${fmtCredit(f.credit)}", color = Color.White.copy(alpha = 0.9f), size = 10)
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HomeStat("DONE", "0", Modifier.weight(1f))
            HomeStat("CME", "0.00", Modifier.weight(1f))
            HomeStat("PACKS", "${cases.map { it.packId }.distinct().count()}", Modifier.weight(1f))
        }
        Spacer(Modifier.height(20.dp))

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Recommended", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
            Text("All cases", color = kl.primary, fontWeight = FontWeight.SemiBold, fontSize = 12.5f.sp,
                modifier = Modifier.clickable(onClick = onSeeAll))
        }
        Spacer(Modifier.height(11.dp))
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            cases.take(4).forEach { CaseCard(it, onOpenCase) }
            if (cases.isEmpty()) EmptyNote("No cases installed yet. Add a pack from the Cases tab.")
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun HomeStat(label: String, value: String, modifier: Modifier = Modifier) {
    val kl = LocalKl.current
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(kl.surface)
        .border(1.dp, kl.line, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 11.dp)) {
        Text(label, fontFamily = MonoFamily, fontSize = 9.sp, letterSpacing = 0.5.sp, color = kl.muted)
        Spacer(Modifier.height(2.dp))
        Text(value, color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 20.sp, letterSpacing = (-0.02f).sp)
    }
}

// ── Library (cases + downloadable packs) ─────────────────────────────────────
@Composable
fun LibraryScreen(
    cases: List<LearnCase>,
    packs: List<PackEntry>,
    downloading: Map<String, Float>,
    onOpenCase: (LearnCase) -> Unit,
    onDownload: (PackInfo) -> Unit,
    onRemove: (PackInfo) -> Unit,
) {
    val kl = LocalKl.current
    var topic by remember { mutableStateOf("All") }
    val topics = listOf("All") + cases.map { it.topic }.distinct()
    val shown = if (topic == "All") cases else cases.filter { it.topic == topic }
    val available = packs.filter { it.status == PackStatus.Available }

    Column(Modifier.fillMaxSize()) {
        // Topic filter chips
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            topics.forEach { tp ->
                val on = tp == topic
                Text(
                    tp, fontSize = 12.5f.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (on) Color.White else kl.body,
                    modifier = Modifier.clip(RoundedCornerShape(999.dp))
                        .background(if (on) kl.primary else kl.surface)
                        .border(1.dp, if (on) Color.Transparent else kl.line, RoundedCornerShape(999.dp))
                        .clickable { topic = tp }.padding(horizontal = 13.dp, vertical = 6.dp),
                )
            }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(bottom = 22.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                shown.forEach { CaseCard(it, onOpenCase) }
                if (shown.isEmpty()) EmptyNote("No cases in this topic yet.")
            }
            if (available.isNotEmpty()) {
                Spacer(Modifier.height(22.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Icon(KlIcons.download, null, tint = kl.primary, modifier = Modifier.size(18.dp))
                    Text("More case packs", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
                }
                Spacer(Modifier.height(4.dp))
                Text("Free to download — pulled in small packs so you choose how to spend your data.",
                    color = kl.muted, fontSize = 12.sp, lineHeight = 17.sp)
                Spacer(Modifier.height(11.dp))
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    available.forEach { entry ->
                        PackCard(entry.info, downloading[entry.info.id], onDownload = { onDownload(entry.info) })
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun PackCard(info: PackInfo, progress: Float?, onDownload: () -> Unit) {
    val kl = LocalKl.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(kl.surface)
            .border(1.dp, kl.line, RoundedCornerShape(14.dp)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(11.dp)).background(kl.soft), contentAlignment = Alignment.Center) {
                Icon(KlIcons.cases, null, tint = kl.primary, modifier = Modifier.size(20.dp))
            }
            Column(Modifier.weight(1f)) {
                OneLine(info.title, color = kl.ink, fontSize = 14, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(2.dp))
                MonoMeta("${info.caseCount} cases · ~${packSize(info.approxSizeKb)}", color = kl.muted, size = 10)
            }
            if (progress == null) {
                Row(
                    Modifier.clip(RoundedCornerShape(9.dp)).background(kl.soft)
                        .clickable(onClick = onDownload).padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(KlIcons.download, null, tint = kl.deep, modifier = Modifier.size(15.dp))
                    Text("Get", color = kl.deep, fontWeight = FontWeight.SemiBold, fontSize = 12.5f.sp)
                }
            }
        }
        if (info.subtitle.isNotBlank()) {
            Spacer(Modifier.height(9.dp))
            Text(info.subtitle, color = kl.body, fontSize = 12.5f.sp, lineHeight = 18.sp)
        }
        if (progress != null) {
            Spacer(Modifier.height(11.dp))
            KlProgressBar(progress, height = 5.dp)
            Spacer(Modifier.height(5.dp))
            MonoMeta("DOWNLOADING · ${(progress * 100).toInt()}%", color = kl.muted, size = 9)
        }
    }
}

// ── Progress ─────────────────────────────────────────────────────────────────
@Composable
fun ProgressScreen(cases: List<LearnCase>) {
    val kl = LocalKl.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 16.dp)) {
        CoralHero {
            Column(Modifier.padding(20.dp)) {
                Text("CME THIS YEAR", fontFamily = MonoFamily, fontSize = 9.5f.sp, letterSpacing = 0.7.sp,
                    color = Color.White.copy(alpha = 0.85f))
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("0.00", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 40.sp, letterSpacing = (-0.03f).sp)
                    Text("credits", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp, modifier = Modifier.padding(bottom = 6.dp))
                }
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White).padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Icon(KlIcons.award, null, tint = kl.deep, modifier = Modifier.size(16.dp))
                    Text("Download certificate", color = kl.deep, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
        Spacer(Modifier.height(16.dp))

        val topics = cases.map { it.topic }.distinct()
        if (topics.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(kl.surface)
                .border(1.dp, kl.line, RoundedCornerShape(14.dp)).padding(16.dp)) {
                Text("TOPICS AVAILABLE", fontFamily = MonoFamily, fontSize = 10.sp, letterSpacing = 0.6.sp, color = kl.muted)
                Spacer(Modifier.height(12.dp))
                topics.forEachIndexed { i, t ->
                    if (i > 0) Spacer(Modifier.height(11.dp))
                    val count = cases.count { it.topic == t }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(t, color = kl.body, fontWeight = FontWeight.Medium, fontSize = 12.5f.sp)
                        MonoMeta("$count case${if (count == 1) "" else "s"}", color = kl.muted, size = 11)
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
        }

        Text("Completed", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
        Spacer(Modifier.height(11.dp))
        EmptyNote("Finish a case and it will appear here, with your score and CME credit.")
        Spacer(Modifier.height(8.dp))
    }
}

// ── About ────────────────────────────────────────────────────────────────────
@Composable
fun AboutScreen() {
    val kl = LocalKl.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        CoralHero(modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 14.dp)) {
            Column(Modifier.padding(20.dp)) {
                KlLockup(size = 22.dp, markColor = Color.White, markFg = kl.primary, textColor = Color.White,
                    suffixColor = Color.White.copy(alpha = 0.72f))
                Spacer(Modifier.height(14.dp))
                Text("Sharper clinical judgment, one case at a time.", color = Color.White, fontWeight = FontWeight.Bold,
                    fontSize = 23.sp, lineHeight = 26.sp, letterSpacing = (-0.025f).sp)
                Spacer(Modifier.height(10.dp))
                Text("A free continuing-education tool for clinicians in Uganda's health centres. Work realistic cases the way you work a live clinic.",
                    color = Color.White.copy(alpha = 0.93f), fontSize = 13.5f.sp, lineHeight = 20.sp)
            }
        }

        Column(Modifier.padding(18.dp)) {
            Text("What you build here", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
            Spacer(Modifier.height(11.dp))
            val builds = listOf(
                Triple(KlIcons.flag, "Danger-sign recognition", "Spot when a routine fever or cough is actually an emergency."),
                Triple(KlIcons.flask, "Test-before-treat", "Order and read the right investigation before you treat."),
                Triple(KlIcons.calc, "Weight-based dosing", "Get the mg/kg maths right, with the clinic's own dose calculator."),
                Triple(KlIcons.chart, "Accurate HMIS coding", "Code the confirmed diagnosis — the number that makes reports true."),
            )
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                builds.forEach { (icon, t, d) -> BuildRow(icon, t, d) }
            }

            Spacer(Modifier.height(16.dp))
            val facts = listOf(
                "Free, forever" to "Every clinician, no clinic account, no cost.",
                "Generated cases only" to "Every patient and result is invented for teaching. Never real PHI.",
                "CME on completion" to "Each case earns logged, downloadable credit.",
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                facts.forEach { (t, d) ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(kl.wash)
                        .border(1.dp, kl.lineSoft, RoundedCornerShape(11.dp)).padding(horizontal = 13.dp, vertical = 11.dp)) {
                        Text(t, color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Spacer(Modifier.height(2.dp))
                        Text(d, color = kl.body, fontSize = 12.sp, lineHeight = 17.sp)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            PoweredByKaribuEhr()
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun BuildRow(icon: ImageVector, title: String, desc: String) {
    val kl = LocalKl.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(kl.surface)
            .border(1.dp, kl.line, RoundedCornerShape(13.dp)).padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(9.dp)).background(kl.soft), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = kl.primary, modifier = Modifier.size(18.dp))
        }
        Column {
            Text(title, color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 13.5f.sp)
            Spacer(Modifier.height(2.dp))
            Text(desc, color = kl.body, fontSize = 12.5f.sp, lineHeight = 18.sp)
        }
    }
}

/** The single, modest callback to KaribuEHR — coral hands off to cobalt. */
@Composable
private fun PoweredByKaribuEhr() {
    val kl = LocalKl.current
    var sent by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(kl.surface)
            .border(1.dp, Cobalt.copy(alpha = 0.18f), RoundedCornerShape(14.dp)).padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KaribuMark(size = 24.dp, color = Cobalt)
            Text("POWERED BY KARIBUEHR", fontFamily = MonoFamily, fontSize = 9.5f.sp, fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.5.sp, color = Cobalt)
        }
        Spacer(Modifier.height(10.dp))
        Text("These cases run on a real EHR.", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
        Spacer(Modifier.height(6.dp))
        Text("The chart inside each case is KaribuEHR — the record system used in clinics for everyday documentation, dosing and reporting. If your facility wants it, apply below. It's provisioned per-clinic; KaribuLearn stays free regardless.",
            color = kl.body, fontSize = 13.sp, lineHeight = 20.sp)
        Spacer(Modifier.height(14.dp))
        if (!sent) {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                listOf("Facility · Susunga HC III", "District · Mityana", "Phone · +256 7…").forEach { ph ->
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(kl.bg)
                        .border(1.dp, kl.line, RoundedCornerShape(9.dp)).padding(horizontal = 12.dp, vertical = 11.dp)) {
                        Text(ph, color = kl.muted, fontSize = 13.5f.sp)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(Cobalt)
                .clickable { sent = true }.padding(vertical = 13.dp), contentAlignment = Alignment.Center) {
                Text("Apply for your clinic", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
            Spacer(Modifier.height(10.dp))
            Text("The Karibu team replies within two working days.", color = kl.muted, fontSize = 11.sp,
                modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        } else {
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(46.dp).clip(RoundedCornerShape(999.dp)).background(GreenSoft), contentAlignment = Alignment.Center) {
                    Icon(KlIcons.checkCircle, null, tint = Green, modifier = Modifier.size(24.dp))
                }
                Spacer(Modifier.height(10.dp))
                Text("Application sent", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
                Spacer(Modifier.height(4.dp))
                Text("We'll be in touch within two working days.", color = kl.body, fontSize = 12.5f.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
    }
}

@Composable
fun EmptyNote(text: String) {
    val kl = LocalKl.current
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .border(1.dp, kl.line, RoundedCornerShape(12.dp)).padding(vertical = 18.dp, horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = kl.muted, fontSize = 12.5f.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
}

@Composable
fun KlLoading() {
    val kl = LocalKl.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = kl.primary) }
}

private fun packSize(kb: Int): String = if (kb >= 1024) "${"%.1f".format(kb / 1024f)} MB" else "$kb KB"
