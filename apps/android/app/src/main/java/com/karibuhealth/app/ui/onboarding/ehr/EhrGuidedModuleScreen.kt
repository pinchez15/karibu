package com.karibuhealth.app.ui.onboarding.ehr

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Lightbulb
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.learn.KlButton
import com.karibuhealth.app.ui.learn.KlBtnKind
import com.karibuhealth.app.ui.learn.MonoMeta
import com.karibuhealth.app.ui.theme.AmberInk
import com.karibuhealth.app.ui.theme.AmberSoft
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

@Composable
fun EhrGuidedModuleScreen(
    module: EhrModuleDef,
    stepIndex: Int,
    isSubmitting: Boolean,
    error: String?,
    onBack: () -> Unit,
    onStepChange: (Int) -> Unit,
    onCompleteModule: () -> Unit,
) {
    val step = module.steps[stepIndex]
    val isLast = stepIndex == module.steps.lastIndex
    var actionDone by remember(stepIndex) { mutableStateOf(false) }
    val needsAction = step.requiresMockAction
    val canAdvance = !needsAction || actionDone

    Column(Modifier.fillMaxSize().background(Bg)) {
        // Header — cobalt ink, white text (matches web)
        Column(
            Modifier
                .fillMaxWidth()
                .background(Cobalt)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            KlButton("All modules", onBack, kind = KlBtnKind.GhostDark, modifier = Modifier.padding(bottom = 4.dp))
            MonoMeta(module.roleLabel.uppercase(), color = CobaltSoft.copy(alpha = 0.9f), size = 10)
            Text(module.title, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Text(
                "Step ${stepIndex + 1} of ${module.steps.size}",
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                module.steps.forEachIndexed { i, _ ->
                    Box(
                        Modifier
                            .weight(1f)
                            .height(3.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(if (i <= stepIndex) Color.White else Color.White.copy(alpha = 0.25f)),
                    )
                }
            }
        }

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MonoMeta("Practice screen (training only — no real data saved)", color = Muted, size = 10)
            EhrMockScreen(
                kind = module.mockKind,
                activeStepId = step.id,
                onStepAction = { stepId ->
                    if (stepId == step.id) actionDone = true
                },
            )

            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Surface)
                    .padding(14.dp),
            ) {
                Text(step.title, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Ink)
                Text(
                    renderCoachText(step.body),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    color = Body,
                    modifier = Modifier.padding(top = 8.dp),
                )
                step.paper?.let { paper ->
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Bg)
                            .padding(10.dp),
                    ) {
                        MonoMeta("From paper", color = Muted, size = 10)
                        Text(paper, fontSize = 12.sp, lineHeight = 17.sp, color = Body, modifier = Modifier.padding(top = 4.dp))
                    }
                }
                step.tip?.let { tip ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(AmberSoft)
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(Icons.Default.Lightbulb, null, tint = AmberInk, modifier = Modifier.padding(top = 2.dp))
                        Text(tip, fontSize = 12.sp, lineHeight = 17.sp, color = AmberInk)
                    }
                }
                if (needsAction && !actionDone) {
                    Text(
                        "Tap the highlighted button on the practice screen to continue.",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Cobalt,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                error?.let {
                    Text(it, color = Red, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }

        Box(
            Modifier
                .fillMaxWidth()
                .background(Surface)
                .padding(16.dp),
        ) {
            if (isSubmitting) {
                CircularProgressIndicator(Modifier.align(Alignment.Center), color = Cobalt)
            } else {
                KlButton(
                    text = if (isLast) "Complete module" else "Next step",
                    onClick = {
                        if (!canAdvance) return@KlButton
                        if (isLast) onCompleteModule() else onStepChange(stepIndex + 1)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    kind = KlBtnKind.Primary,
                    enabled = canAdvance,
                    trailingIcon = if (!isLast) Icons.AutoMirrored.Filled.ArrowForward else null,
                )
            }
        }
    }
}

@Composable
private fun renderCoachText(text: String) = buildAnnotatedString {
    val parts = text.split(Regex("(\\*\\*[^*]+\\*\\*)"))
    parts.forEach { part ->
        if (part.startsWith("**") && part.endsWith("**")) {
            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = Ink)) {
                append(part.removeSurrounding("**"))
            }
        } else {
            append(part)
        }
    }
}
