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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.karibuhealth.app.ui.learn.KlPalette
import com.karibuhealth.app.ui.learn.LocalKl
import com.karibuhealth.app.ui.learn.KlButton
import com.karibuhealth.app.ui.learn.KlBtnKind
import com.karibuhealth.app.ui.learn.KlIcons
import com.karibuhealth.app.ui.learn.MonoMeta
import com.karibuhealth.app.ui.onboarding.data.OnboardingModuleEntry
import com.karibuhealth.app.ui.onboarding.ehr.EhrGuidedModuleScreen
import com.karibuhealth.app.ui.onboarding.ehr.EhrOnboardingModules
import com.karibuhealth.app.ui.theme.Bg
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltDeep
import com.karibuhealth.app.ui.theme.CobaltInk
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.GreenSoft
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.KaribuMark
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted
import com.karibuhealth.app.ui.theme.Red
import com.karibuhealth.app.ui.theme.Surface

private sealed interface OnboardingNav {
    data object Welcome : OnboardingNav
    data object Hub : OnboardingNav
    data class Guided(val moduleId: String, val stepIndex: Int = 0) : OnboardingNav
}

private val EhrOnboardingPalette = KlPalette(
    primary = Cobalt,
    bright = Cobalt,
    deep = CobaltDeep,
    soft = CobaltSoft,
    wash = CobaltSoft,
    gradStart = CobaltInk,
    gradMid = CobaltDeep,
    gradEnd = Cobalt,
    ink = Ink,
    body = Body,
    muted = Muted,
    line = Line,
    bg = Bg,
    surface = Surface,
)

/**
 * KaribuEHR staff training — EHR-native guided modules (mirrors web `/onboarding`).
 * Interactive mock screens + coach copy; progress synced via Supabase RPCs.
 */
@Composable
fun OnboardingRoot(
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: OnboardingViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var nav by remember { mutableStateOf<OnboardingNav>(OnboardingNav.Welcome) }
    var guidedStep by remember { mutableIntStateOf(0) }

    LaunchedEffect(state.allComplete) {
        if (state.allComplete) onFinished()
    }

    LaunchedEffect(nav) {
        if (nav is OnboardingNav.Hub) viewModel.refresh()
    }

    CompositionLocalProvider(LocalKl provides EhrOnboardingPalette) {
        Box(
            modifier
                .fillMaxSize()
                .background(Bg)
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
                    onOpenModule = { entry ->
                        guidedStep = 0
                        nav = OnboardingNav.Guided(entry.module.id, 0)
                    },
                )
            }

            is OnboardingNav.Guided -> {
                val module = EhrOnboardingModules.byId[n.moduleId]
                if (module == null) {
                    nav = OnboardingNav.Hub
                } else {
                    EhrGuidedModuleScreen(
                        module = module,
                        stepIndex = guidedStep,
                        isSubmitting = state.isSubmitting,
                        error = state.error,
                        onBack = { nav = OnboardingNav.Hub },
                        onStepChange = { guidedStep = it },
                        onCompleteModule = {
                            viewModel.completeModule(n.moduleId, null, null) { allDone ->
                                if (allDone) {
                                    onFinished()
                                } else {
                                    nav = OnboardingNav.Hub
                                }
                            }
                        },
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
    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Cobalt, CobaltDeep))),
    ) {
        Column(Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
            Spacer(Modifier.height(28.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KaribuMark(size = 32.dp, color = Color.White, fg = Cobalt)
                Text("KaribuEHR", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                MonoMeta("STAFF TRAINING", color = Color.White.copy(alpha = 0.7f))
                Spacer(Modifier.height(12.dp))
                Text(
                    "Learn KaribuEHR before your first real patient",
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    subtitle.ifBlank {
                        "Six short modules walk you through the same screens you will use every day. No classroom required."
                    },
                    color = Color.White.copy(alpha = 0.88f),
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                )
                Spacer(Modifier.height(20.dp))
                Text(
                    "· Practice on safe training screens — nothing is saved to real patients\n" +
                        "· Every role should complete all $moduleCount modules once\n" +
                        "· About 30–45 minutes total",
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
            }
            KlButton(
                "Start training",
                onStart,
                Modifier.fillMaxWidth().padding(bottom = 28.dp),
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
    val done = state.modules.count { it.completed }
    val total = state.modules.size

    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Cobalt)
                .padding(horizontal = 20.dp, vertical = 18.dp),
        ) {
            Text(state.title.ifBlank { "KaribuEHR training" }, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
            Spacer(Modifier.height(6.dp))
            Text("$done of $total modules complete", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
            Spacer(Modifier.height(10.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(Color.White.copy(alpha = 0.2f)),
            ) {
                if (total > 0) {
                    Box(
                        Modifier
                            .fillMaxWidth(done.toFloat() / total)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color.White),
                    )
                }
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
            Text(
                "Work through each module in order. Tap a card to practice the real EHR workflow with step-by-step guidance.",
                fontSize = 13.sp,
                color = Muted,
                modifier = Modifier.padding(bottom = 4.dp),
            )
            state.error?.let {
                Text(it, color = Red, fontSize = 13.sp)
                KlButton("Retry sync", onRefresh, Modifier.fillMaxWidth(), KlBtnKind.Ghost)
            }
            state.modules.forEachIndexed { index, entry ->
                val ehr = EhrOnboardingModules.byId[entry.module.id]
                ModuleCard(
                    index = index + 1,
                    entry = entry,
                    roleLabel = ehr?.roleLabel ?: roleLabel(entry.module.simulatedRole),
                    onClick = { onOpenModule(entry) },
                )
            }
        }
    }
}

@Composable
private fun ModuleCard(
    index: Int,
    entry: OnboardingModuleEntry,
    roleLabel: String,
    onClick: () -> Unit,
) {
    val mod = entry.module
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (entry.completed) GreenSoft.copy(alpha = 0.5f) else Surface)
            .border(1.dp, if (entry.completed) Green.copy(alpha = 0.35f) else Line, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            if (entry.completed) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
            null,
            tint = if (entry.completed) Green else Muted,
            modifier = Modifier.size(22.dp).padding(top = 2.dp),
        )
        Column(Modifier.weight(1f)) {
            MonoMeta("$index. $roleLabel", color = Muted, size = 10)
            Text(mod.title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Ink)
            Text(
                EhrOnboardingModules.byId[mod.id]?.subtitle ?: mod.subtitle,
                fontSize = 12.sp,
                color = Body,
                lineHeight = 16.sp,
            )
        }
        Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = Muted, modifier = Modifier.size(18.dp))
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
