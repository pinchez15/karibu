package com.karibuhealth.app.ui.onboarding

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
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.karibuhealth.app.ui.learn.CaseCompleteScreen
import com.karibuhealth.app.ui.learn.CoralPalette
import com.karibuhealth.app.ui.learn.KlButton
import com.karibuhealth.app.ui.learn.KlBtnKind
import com.karibuhealth.app.ui.learn.KlIcons
import com.karibuhealth.app.ui.learn.KlLockup
import com.karibuhealth.app.ui.learn.LocalKl
import com.karibuhealth.app.ui.learn.MonoMeta
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.learn.walkthrough.WalkthroughScreen
import com.karibuhealth.app.ui.onboarding.data.OnboardingModuleEntry
import com.karibuhealth.app.ui.onboarding.model.OnboardingModule
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.GreenSoft
import com.karibuhealth.app.ui.theme.KaribuMark
import com.karibuhealth.app.ui.theme.MonoFamily
import kotlinx.coroutines.launch

private sealed interface OnboardingNav {
    data object Welcome : OnboardingNav
    data object Hub : OnboardingNav
    data class Intro(val entry: OnboardingModuleEntry) : OnboardingNav
    data class Walk(val entry: OnboardingModuleEntry, val case: LearnCase) : OnboardingNav
    data class Complete(val entry: OnboardingModuleEntry, val case: LearnCase, val score: Int, val total: Int) : OnboardingNav
}

/**
 * KaribuEHR Onboarding — required cross-role training before real patients.
 * Reuses the KaribuLearn walkthrough shell (coral coach + cobalt chart simulation)
 * with EHR-specific module framing. Android-first; web adds desk-wide views later.
 */
@Composable
fun OnboardingRoot(
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: OnboardingViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var nav by remember { mutableStateOf<OnboardingNav>(OnboardingNav.Welcome) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.allComplete) {
        if (state.allComplete) onFinished()
    }

    LaunchedEffect(nav) {
        if (nav is OnboardingNav.Hub) viewModel.refresh()
    }

    CompositionLocalProvider(LocalKl provides CoralPalette) {
        Box(
            modifier
                .fillMaxSize()
                .background(CoralPalette.bg)
                .systemBarsPadding(),
        ) {
            when (val n = nav) {
                OnboardingNav.Welcome -> {
                    BackHandler { /* blocked until training done */ }
                    OnboardingWelcomeScreen(
                        moduleCount = state.modules.size,
                        subtitle = state.subtitle,
                        onStart = { nav = OnboardingNav.Hub },
                    )
                }

                OnboardingNav.Hub -> {
                    BackHandler { nav = OnboardingNav.Welcome }
                    OnboardingHubScreen(
                        state = state,
                        onRefresh = viewModel::refresh,
                        onOpenModule = { entry -> nav = OnboardingNav.Intro(entry) },
                    )
                }

                is OnboardingNav.Intro -> {
                    BackHandler { nav = OnboardingNav.Hub }
                    OnboardingIntroScreen(
                        entry = n.entry,
                        isSubmitting = state.isSubmitting,
                        onBack = { nav = OnboardingNav.Hub },
                        onBegin = { entry ->
                            scope.launch {
                                val case = viewModel.loadCase(entry.module)
                                if (case != null && case.steps.isNotEmpty()) {
                                    nav = OnboardingNav.Walk(entry, case)
                                }
                            }
                        },
                    )
                }

                is OnboardingNav.Walk -> WalkthroughScreen(
                    case = n.case,
                    showTeaching = true,
                    onExit = { nav = OnboardingNav.Intro(n.entry) },
                    onComplete = { score, total ->
                        nav = OnboardingNav.Complete(n.entry, n.case, score, total)
                    },
                )

                is OnboardingNav.Complete -> {
                    val kl = LocalKl.current
                    CaseCompleteScreen(
                        case = n.case,
                        score = n.score,
                        total = n.total,
                        onLibrary = {
                            viewModel.completeModule(n.entry.module.id, n.score, n.total) { allDone ->
                                nav = if (allDone) OnboardingNav.Welcome else OnboardingNav.Hub
                            }
                        },
                    )
                    // Override footer CTA label via a small banner — CaseComplete uses onLibrary.
                    if (state.error != null) {
                        Text(
                            state.error!!,
                            color = kl.primary,
                            fontSize = 12.sp,
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(16.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OnboardingWelcomeScreen(
    moduleCount: Int,
    subtitle: String,
    onStart: () -> Unit,
) {
    val kl = LocalKl.current
    Box(Modifier.fillMaxSize().background(kl.gradient())) {
        Column(Modifier.fillMaxSize().padding(horizontal = 26.dp)) {
            Spacer(Modifier.height(26.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KaribuMark(size = 28.dp, color = Color.White)
                Text(
                    "KaribuEHR",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                )
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                MonoMeta("STAFF TRAINING · ANDROID", color = Color.White.copy(alpha = 0.85f))
                Spacer(Modifier.height(14.dp))
                Text(
                    "Learn every role before your first patient.",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 32.sp,
                    lineHeight = 36.sp,
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    subtitle.ifBlank {
                        "Walk through records, nursing, clinical, lab, pharmacy, and billing — " +
                            "the way you'll use Karibu on your phone. No real patient data is saved."
                    },
                    color = Color.White.copy(alpha = 0.92f),
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                )
                Spacer(Modifier.height(24.dp))
                MonoMeta(
                    "$moduleCount modules · all roles · required",
                    color = Color.White.copy(alpha = 0.85f),
                )
            }
            KlButton(
                "Start training",
                onStart,
                Modifier.fillMaxWidth().padding(bottom = 30.dp),
                KlBtnKind.OnDark,
                trailingIcon = KlIcons.arrowRight,
            )
        }
    }
}

@Composable
private fun OnboardingHubScreen(
    state: OnboardingUiState,
    onRefresh: () -> Unit,
    onOpenModule: (OnboardingModuleEntry) -> Unit,
) {
    val kl = LocalKl.current
    val done = state.modules.count { it.completed }
    val total = state.modules.size

    Column(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxWidth()
                .background(Cobalt)
                .padding(horizontal = 20.dp, vertical = 18.dp),
        ) {
            Column {
                Text(state.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Spacer(Modifier.height(6.dp))
                Text(
                    "$done of $total modules complete",
                    color = Color.White.copy(alpha = 0.85f),
                    fontSize = 13.sp,
                )
            }
        }

        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Cobalt)
            }
            return
        }

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            state.error?.let {
                Text(it, color = kl.primary, fontSize = 13.sp)
                KlButton("Retry sync", onRefresh, Modifier.fillMaxWidth())
            }
            state.modules.forEach { entry ->
                ModuleCard(entry, onClick = { onOpenModule(entry) })
            }
        }
    }
}

@Composable
private fun ModuleCard(entry: OnboardingModuleEntry, onClick: () -> Unit) {
    val kl = LocalKl.current
    val mod = entry.module
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (entry.completed) GreenSoft else kl.surface)
            .border(1.dp, if (entry.completed) Green.copy(alpha = 0.35f) else kl.line, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(if (entry.completed) Green.copy(alpha = 0.15f) else CobaltSoft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (entry.completed) KlIcons.check else KlIcons.cases,
                null,
                tint = if (entry.completed) Green else Cobalt,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(Modifier.weight(1f)) {
            MonoMeta(roleLabel(mod.simulatedRole), color = kl.muted)
            Text(mod.title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = kl.ink)
            Text(mod.subtitle, fontSize = 12.sp, color = kl.body, lineHeight = 16.sp)
        }
        Icon(KlIcons.arrowRight, null, tint = kl.muted, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun OnboardingIntroScreen(
    entry: OnboardingModuleEntry,
    isSubmitting: Boolean,
    onBack: () -> Unit,
    onBegin: (OnboardingModuleEntry) -> Unit,
) {
    val kl = LocalKl.current
    val mod = entry.module
    Column(Modifier.fillMaxSize().background(kl.bg)) {
        Box(Modifier.fillMaxWidth().background(kl.gradient()).padding(20.dp)) {
            Column {
                KlButton("Back to modules", onBack, kind = KlBtnKind.GhostDark)
                Spacer(Modifier.height(16.dp))
                MonoMeta("SIMULATED ROLE · ${roleLabel(mod.simulatedRole).uppercase()}", color = Color.White.copy(0.85f))
                Spacer(Modifier.height(8.dp))
                Text(mod.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 24.sp)
                Text(mod.subtitle, color = Color.White.copy(0.9f), fontSize = 14.sp, lineHeight = 20.sp)
            }
        }
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
        ) {
            Text(mod.coachIntro, color = kl.body, fontSize = 15.sp, lineHeight = 22.sp)
            mod.webBonus?.let {
                Spacer(Modifier.height(16.dp))
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(CobaltSoft)
                        .padding(14.dp),
                ) {
                    MonoMeta("WEB BONUS", color = Cobalt)
                    Spacer(Modifier.height(6.dp))
                    Text(it, color = kl.ink, fontSize = 13.sp, lineHeight = 18.sp)
                }
            }
        }
        KlButton(
            if (entry.completed) "Practice again" else "Begin module",
            { onBegin(entry) },
            Modifier.fillMaxWidth().padding(20.dp),
            enabled = !isSubmitting,
        )
    }
}

private fun roleLabel(role: String): String = when (role) {
    "records_officer" -> "Records"
    "nurse" -> "Nurse"
    "clinical_officer" -> "Clinician"
    "doctor" -> "Doctor"
    "midwife" -> "Midwife"
    "lab_tech" -> "Lab"
    "dispenser" -> "Pharmacy"
    "admin" -> "Admin"
    else -> role.replace('_', ' ').replaceFirstChar { it.uppercase() }
}
