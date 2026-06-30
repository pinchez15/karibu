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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material.icons.Icons
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import android.net.Uri
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.learn.data.supabase.CaseCompletionRow
import com.karibuhealth.learn.data.PackStatus
import com.karibuhealth.learn.model.CaseProgressStatus
import com.karibuhealth.learn.model.LearnChapter
import com.karibuhealth.learn.model.caseProgressStatus
import com.karibuhealth.learn.model.chapterProgress
import com.karibuhealth.learn.model.LearnCase
import com.karibuhealth.learn.model.PackInfo
import com.karibuhealth.learn.model.resolveLevel
import com.karibuhealth.learn.chart.Cobalt
import com.karibuhealth.learn.chart.CobaltSoft
import com.karibuhealth.learn.chart.Green
import com.karibuhealth.learn.chart.GreenSoft
import com.karibuhealth.learn.chart.KaribuMark
import com.karibuhealth.learn.chart.MonoFamily

// ── Welcome ──────────────────────────────────────────────────────────────────
@Composable
fun WelcomeScreen(
    caseCount: Int,
    topicCount: Int,
    onBrowse: () -> Unit,
    onSignIn: () -> Unit,
) {
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
                Spacer(Modifier.height(26.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                    WelcomeStat(if (caseCount > 0) "$caseCount" else "—", "playable")
                    WelcomeStat(if (topicCount > 0) "$topicCount" else "—", "topics")
                }
            }
            Column(Modifier.padding(bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                KlButton("Browse cases", onBrowse, Modifier.fillMaxWidth(), KlBtnKind.OnDark, trailingIcon = KlIcons.arrowRight)
                KlButton("Sign in for CME credit", onSignIn, Modifier.fillMaxWidth(), KlBtnKind.GhostDark)
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
fun HomeScreen(
    cases: List<LearnCase>,
    progress: com.karibuhealth.learn.LearnProgressUiState,
    installedPackCount: Int,
    catalogCaseCount: Int,
    catalogTopicCount: Int,
    onOpenCase: (LearnCase) -> Unit,
    onSeeAll: () -> Unit,
) {
    val kl = LocalKl.current
    val completionMap = progress.completionMap
    val redoCases = cases.filter { caseProgressStatus(completionMap[it.id]) == CaseProgressStatus.NeedsRedo }
    val feature = redoCases.firstOrNull()
        ?: cases.firstOrNull { it.ready && caseProgressStatus(completionMap[it.id]) == CaseProgressStatus.NotStarted }
        ?: cases.firstOrNull { it.ready }
    val installedPlayable = cases.count { it.ready }
    val passedCount = cases.count { caseProgressStatus(completionMap[it.id]) == CaseProgressStatus.Passed }
    val creditsLabel = fmtCredit(progress.creditsEarned)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 16.dp)) {
        feature?.let { f ->
            val isRedo = caseProgressStatus(completionMap[f.id]) == CaseProgressStatus.NeedsRedo
            CoralHero(onClick = { onOpenCase(f) }) {
                Column(Modifier.padding(18.dp)) {
                    Text(
                        if (isRedo) "RETRY FOR FULL CREDIT" else "CONTINUE LEARNING",
                        fontFamily = MonoFamily, fontSize = 9.5f.sp, letterSpacing = 0.7.sp,
                        color = Color.White.copy(alpha = 0.85f),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(f.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 25.sp,
                        letterSpacing = (-0.02f).sp)
                    if (isRedo) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Score ${completionMap[f.id]?.score}/${completionMap[f.id]?.total} — try again for full CME credit.",
                            color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp, lineHeight = 18.sp,
                        )
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            Modifier.clip(RoundedCornerShape(9.dp)).background(Color.White).padding(horizontal = 14.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(KlIcons.play, null, tint = kl.deep, modifier = Modifier.size(14.dp))
                            Text(if (isRedo) "Retry" else "Start", color = kl.deep, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                        MonoMeta("${f.mins} min · CME ${fmtCredit(f.credit)}", color = Color.White.copy(alpha = 0.9f), size = 10)
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HomeStat("CASES", if (installedPlayable > 0) "$installedPlayable" else "$catalogCaseCount", Modifier.weight(1f))
            HomeStat("TOPICS", "$catalogTopicCount", Modifier.weight(1f))
            HomeStat("PASSED", if (installedPlayable > 0) "$passedCount" else "—", Modifier.weight(1f))
        }
        if (progress.isSignedIn) {
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HomeStat("CME", creditsLabel, Modifier.weight(1f))
                HomeStat("PACKS", "$installedPackCount", Modifier.weight(1f))
            }
        }
        if (redoCases.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text(
                "${redoCases.size} case${if (redoCases.size == 1) "" else "s"} need${if (redoCases.size == 1) "s" else ""} a retry for full credit",
                color = Color(0xFFB45309), fontSize = 12.5f.sp, fontWeight = FontWeight.Medium,
            )
        }
        Spacer(Modifier.height(20.dp))

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Recommended", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
            Text("All chapters", color = kl.primary, fontWeight = FontWeight.SemiBold, fontSize = 12.5f.sp,
                modifier = Modifier.clickable(onClick = onSeeAll))
        }
        Spacer(Modifier.height(11.dp))
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            cases.filter { it.ready }.take(4).forEach { case ->
                CaseCard(case, onOpenCase, completion = completionMap[case.id])
            }
            if (cases.none { it.ready }) EmptyNote("No playable cases yet. Open Cases to download a chapter pack.")
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

// ── Library (chapters + downloadable packs) ───────────────────────────────────
@Composable
fun LibraryScreen(
    chapters: List<LearnChapter>,
    cases: List<LearnCase>,
    completionMap: Map<String, CaseCompletionRow>,
    downloading: Map<String, Float>,
    onOpenChapter: (LearnChapter) -> Unit,
    onDownload: (PackInfo) -> Unit,
) {
    val kl = LocalKl.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 12.dp)) {
        Text(
            "Chapters group cases by clinical topic. Open a chapter to see your progress and retry cases for full credit.",
            color = kl.muted, fontSize = 12.5f.sp, lineHeight = 18.sp,
        )
        Spacer(Modifier.height(14.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            chapters.forEach { chapter ->
                ChapterRow(
                    chapter = chapter,
                    cases = cases.filter { c -> chapter.packs.any { p -> p.info.id == c.packId } },
                    completionMap = completionMap,
                    onClick = { onOpenChapter(chapter) },
                )
            }
        }

        val availablePacks = chapters.flatMap { it.packs }.filter { it.status == PackStatus.Available }.distinctBy { it.info.id }
        if (availablePacks.isNotEmpty()) {
            Spacer(Modifier.height(22.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Icon(KlIcons.download, null, tint = kl.primary, modifier = Modifier.size(18.dp))
                Text("Download more", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
            }
            Spacer(Modifier.height(4.dp))
            Text("Pull chapter packs on your data plan.", color = kl.muted, fontSize = 12.sp)
            Spacer(Modifier.height(11.dp))
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                availablePacks.forEach { entry ->
                    PackCard(entry.info, downloading[entry.info.id], onDownload = { onDownload(entry.info) })
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun ChapterRow(
    chapter: LearnChapter,
    cases: List<LearnCase>,
    completionMap: Map<String, CaseCompletionRow>,
    onClick: () -> Unit,
) {
    val kl = LocalKl.current
    val progress = chapterProgress(cases, completionMap)
    val amber = Color(0xFFB45309)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(kl.surface)
            .border(1.dp, kl.line, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(11.dp)).background(kl.soft), contentAlignment = Alignment.Center) {
                Icon(KlIcons.cases, null, tint = kl.primary, modifier = Modifier.size(20.dp))
            }
            Column(Modifier.weight(1f)) {
                OneLine(chapter.title, color = kl.ink, fontSize = 14, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                if (progress.totalInstalledPlayable > 0) {
                    MonoMeta(
                        "${progress.passed}/${progress.totalInstalledPlayable} passed" +
                            if (progress.needsRedo > 0) " · ${progress.needsRedo} retry" else "",
                        color = if (progress.needsRedo > 0) amber else kl.muted,
                        size = 10,
                    )
                } else {
                    MonoMeta(
                        "${chapter.catalogCaseCount} cases · download to play",
                        color = kl.muted,
                        size = 10,
                    )
                }
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = kl.muted, modifier = Modifier.size(22.dp))
        }
        if (progress.totalInstalledPlayable > 0) {
            Spacer(Modifier.height(10.dp))
            KlProgressBar(progress.fraction, height = 5.dp)
        }
    }
}

@Composable
fun ChapterDetailScreen(
    chapter: LearnChapter,
    cases: List<LearnCase>,
    completionMap: Map<String, CaseCompletionRow>,
    downloading: Map<String, Float>,
    onBack: () -> Unit,
    onOpenCase: (LearnCase) -> Unit,
    onDownload: (PackInfo) -> Unit,
) {
    val kl = LocalKl.current
    val amber = Color(0xFFB45309)
    val chapterCases = cases.filter { c -> chapter.packs.any { p -> p.info.id == c.packId } }
    val progress = chapterProgress(chapterCases, completionMap)
    val levels = chapter.packs.mapNotNull { it.info.resolveLevel() }.distinct().sorted()
    var selectedLevel by remember(chapter.id) { mutableStateOf(levels.firstOrNull() ?: 1) }

    val levelPack = chapter.packs.firstOrNull { it.info.resolveLevel() == selectedLevel }
    val levelCases = chapterCases.filter { it.packId == levelPack?.info?.id }
    val redoCases = levelCases.filter { caseProgressStatus(completionMap[it.id]) == CaseProgressStatus.NeedsRedo }
    val otherCases = levelCases.filter { caseProgressStatus(completionMap[it.id]) != CaseProgressStatus.NeedsRedo }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(kl.surface).padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = kl.ink, modifier = Modifier.size(22.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(chapter.title, color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                if (progress.totalInstalledPlayable > 0) {
                    Text(
                        "${progress.passed} of ${progress.totalInstalledPlayable} passed with full credit",
                        color = kl.muted, fontSize = 12.sp,
                    )
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(kl.lineSoft))

        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 16.dp)) {
            if (progress.totalInstalledPlayable > 0) {
                KlProgressBar(progress.fraction, height = 8.dp)
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MonoMeta("CHAPTER PROGRESS", color = kl.muted, size = 9)
                    MonoMeta("${(progress.fraction * 100).toInt()}%", color = kl.deep, size = 9)
                }
                Spacer(Modifier.height(16.dp))
            }

            if (levels.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    levels.forEach { level ->
                        val on = level == selectedLevel
                        val label = when (level) {
                            1 -> "Level 1"
                            2 -> "Level 2"
                            else -> "Level 3"
                        }
                        Text(
                            label,
                            fontSize = 12.5f.sp,
                            fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
                            color = if (on) Color.White else kl.body,
                            modifier = Modifier.clip(RoundedCornerShape(999.dp))
                                .background(if (on) kl.primary else kl.surface)
                                .border(1.dp, if (on) Color.Transparent else kl.line, RoundedCornerShape(999.dp))
                                .clickable { selectedLevel = level }
                                .padding(horizontal = 13.dp, vertical = 6.dp),
                        )
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            if (levelPack?.status != PackStatus.Installed) {
                val info = levelPack?.info
                if (info != null) {
                    PackCard(info, downloading[info.id], onDownload = { onDownload(info) })
                    Spacer(Modifier.height(16.dp))
                    EmptyNote("Download this level to play ${info.caseCount} cases offline.")
                }
            } else {
                if (redoCases.isNotEmpty()) {
                    Text("Needs practice", color = amber, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Retry these for full CME credit.",
                        color = kl.muted, fontSize = 12.5f.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        redoCases.forEach { case ->
                            CaseCard(case, onOpenCase, completion = completionMap[case.id])
                        }
                    }
                    Spacer(Modifier.height(18.dp))
                }

                if (otherCases.isNotEmpty()) {
                    Text(
                        if (redoCases.isNotEmpty()) "All cases" else "Cases",
                        color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        otherCases.forEach { case ->
                            CaseCard(case, onOpenCase, completion = completionMap[case.id])
                        }
                    }
                }

                if (levelCases.isEmpty()) {
                    EmptyNote("No cases loaded for this level yet.")
                }
            }
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
fun ProgressScreen(
    cases: List<LearnCase>,
    progress: LearnProgressUiState,
    onSignIn: () -> Unit,
) {
    val kl = LocalKl.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 16.dp)) {
        if (!progress.isSignedIn) {
            CoralHero {
                Column(Modifier.padding(20.dp)) {
                    Text("SIGN IN TO TRACK CME", fontFamily = MonoFamily, fontSize = 9.5f.sp, letterSpacing = 0.7.sp,
                        color = Color.White.copy(alpha = 0.85f))
                    Spacer(Modifier.height(10.dp))
                    Text("Your scores and credits sync when you sign in with phone or email.",
                        color = Color.White.copy(alpha = 0.93f), fontSize = 14.sp, lineHeight = 20.sp)
                    Spacer(Modifier.height(14.dp))
                    KlButton("Sign in", onSignIn, Modifier.fillMaxWidth(), KlBtnKind.OnDark)
                }
            }
            Spacer(Modifier.height(16.dp))
        } else {
            val creditsLabel = fmtCredit(progress.creditsEarned)
            CoralHero {
                Column(Modifier.padding(20.dp)) {
                    Text("CME THIS YEAR", fontFamily = MonoFamily, fontSize = 9.5f.sp, letterSpacing = 0.7.sp,
                        color = Color.White.copy(alpha = 0.85f))
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            if (progress.isLoading) "…" else creditsLabel,
                            color = Color.White, fontWeight = FontWeight.Bold, fontSize = 40.sp, letterSpacing = (-0.03f).sp,
                        )
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
        }

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
        if (progress.isSignedIn && progress.completions.isNotEmpty()) {
            progress.completions.forEach { row ->
                CompletionRow(row, cases.firstOrNull { it.id == row.caseId })
                Spacer(Modifier.height(8.dp))
            }
        } else if (progress.isSignedIn) {
            EmptyNote("Finish a case and it will appear here, with your score and CME credit.")
        } else {
            EmptyNote("Sign in, then finish a case — your score and credit will show here.")
        }
        progress.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = kl.primary, fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun CompletionRow(row: CaseCompletionRow, case: LearnCase?) {
    val kl = LocalKl.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(kl.surface)
            .border(1.dp, kl.line, RoundedCornerShape(12.dp)).padding(14.dp),
    ) {
        Text(case?.title ?: row.caseId, color = kl.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            MonoMeta("${row.score}/${row.total}", color = kl.muted, size = 11)
            row.credit?.let { MonoMeta("CME ${fmtCredit(it)}", color = kl.deep, size = 11) }
        }
    }
}

// ── About ────────────────────────────────────────────────────────────────────
@Composable
private fun ComingSoonRow(case: LearnCase) {
    val kl = LocalKl.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(kl.bg)
            .border(1.dp, kl.lineSoft, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(case.title, color = kl.muted, fontWeight = FontWeight.Medium, fontSize = 13.sp)
            MonoMeta("${case.topic} · ${case.mins} min", color = kl.muted, size = 10)
        }
        Text("SOON", fontFamily = MonoFamily, fontSize = 9.sp, color = kl.muted,
            modifier = Modifier.clip(RoundedCornerShape(4.dp)).border(1.dp, kl.line, RoundedCornerShape(4.dp))
                .padding(horizontal = 6.dp, vertical = 2.dp))
    }
}

@Composable
fun AboutScreen() {
    val kl = LocalKl.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        CoralHero(modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 14.dp)) {
            Column(Modifier.padding(20.dp)) {
                KlLockup(size = 22.dp, markColor = Color.White, markFg = kl.primary, textColor = Color.White,
                    suffixColor = Color.White.copy(alpha = 0.72f))
                Spacer(Modifier.height(14.dp))
                Text("Free CME for HC III clinicians.", color = Color.White, fontWeight = FontWeight.Bold,
                    fontSize = 22.sp, lineHeight = 26.sp, letterSpacing = (-0.025f).sp)
            }
        }

        Column(Modifier.padding(18.dp)) {
            Text("What you practice", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
            Spacer(Modifier.height(11.dp))
            val builds = listOf(
                Triple(KlIcons.flag, "Danger signs", "Spot emergencies early."),
                Triple(KlIcons.flask, "Test before treat", "Order the right investigation."),
                Triple(KlIcons.calc, "Weight-based dosing", "Get mg/kg right."),
                Triple(KlIcons.chart, "HMIS coding", "Code the confirmed diagnosis."),
            )
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                builds.forEach { (icon, t, d) -> BuildRow(icon, t, d) }
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
    val context = LocalContext.current
    var name by remember { mutableStateOf("") }
    var clinic by remember { mutableStateOf("") }
    var district by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    val trimmedEmail = email.trim()
    val canSubmit = name.isNotBlank() && clinic.isNotBlank() && district.isNotBlank() &&
        trimmedEmail.contains("@") && phone.isNotBlank()

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
        Text("Want KaribuEHR at your facility?", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
        Spacer(Modifier.height(6.dp))
        Text("The chart in each case is KaribuEHR. Apply below — KaribuLearn stays free.",
            color = kl.body, fontSize = 13.sp, lineHeight = 18.sp)
        Spacer(Modifier.height(14.dp))
        if (!sent) {
            val fieldColors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Cobalt,
                focusedLabelColor = Cobalt,
            )
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it },
                    label = { Text("Name") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                )
                OutlinedTextField(
                    value = clinic, onValueChange = { clinic = it },
                    label = { Text("Clinic") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                )
                OutlinedTextField(
                    value = district, onValueChange = { district = it },
                    label = { Text("District") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                )
                OutlinedTextField(
                    value = email, onValueChange = { email = it },
                    label = { Text("Email") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                )
                OutlinedTextField(
                    value = phone, onValueChange = { phone = it },
                    label = { Text("Phone") },
                    placeholder = { Text("+256 7XX XXX XXX") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                )
            }
            Spacer(Modifier.height(12.dp))
            KlButton(
                text = "Apply for your clinic",
                onClick = {
                    val body = """
                        Name: $name
                        Clinic: $clinic
                        District: $district
                        Email: $trimmedEmail
                        Phone: $phone
                    """.trimIndent()
                    val intent = Intent(Intent.ACTION_SENDTO).apply {
                        data = Uri.parse("mailto:hello@karibu.health")
                        putExtra(Intent.EXTRA_SUBJECT, "KaribuEHR clinic application — $clinic")
                        putExtra(Intent.EXTRA_TEXT, body)
                    }
                    if (intent.resolveActivity(context.packageManager) != null) {
                        context.startActivity(intent)
                        sent = true
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                kind = KlBtnKind.Deep,
                enabled = canSubmit,
            )
        } else {
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(46.dp).clip(RoundedCornerShape(999.dp)).background(GreenSoft), contentAlignment = Alignment.Center) {
                    Icon(KlIcons.checkCircle, null, tint = Green, modifier = Modifier.size(24.dp))
                }
                Spacer(Modifier.height(10.dp))
                Text("Application sent", color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 15.5f.sp)
                Spacer(Modifier.height(4.dp))
                Text("We'll reply within two working days.", color = kl.muted, fontSize = 12.sp,
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
