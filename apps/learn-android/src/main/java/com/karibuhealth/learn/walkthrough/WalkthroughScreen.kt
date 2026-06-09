package com.karibuhealth.learn.walkthrough

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.learn.KlIcons
import com.karibuhealth.learn.LocalKl
import com.karibuhealth.learn.MonoMeta
import com.karibuhealth.learn.model.CaseStep
import com.karibuhealth.learn.model.LearnCase
import com.karibuhealth.learn.model.StepKind
import com.karibuhealth.learn.chart.Green
import com.karibuhealth.learn.chart.GreenSoft
import com.karibuhealth.learn.chart.KaribuMark
import com.karibuhealth.learn.chart.MonoFamily

private data class Answer(val choice: Int, val correct: Boolean)

@Composable
fun WalkthroughScreen(
    case: LearnCase,
    showTeaching: Boolean,
    onExit: () -> Unit,
    onComplete: (score: Int, total: Int) -> Unit,
) {
    val kl = LocalKl.current
    val steps = case.steps
    if (steps.isEmpty()) { onExit(); return }

    var index by remember { mutableIntStateOf(0) }
    val answers = remember { mutableStateMapOf<Int, Answer>() }
    var calcOpen by remember { mutableStateOf(false) }
    val scroll = rememberScrollState()

    val step = steps[index]
    val total = steps.size
    val decisionTotal = steps.count { it.kind == StepKind.decision }
    val answered = answers.containsKey(index)
    val revealed = step.kind == StepKind.story || answered

    BackHandler { if (index > 0) index-- else onExit() }

    Box(Modifier.fillMaxSize().background(kl.bg)) {
        Column(Modifier.fillMaxSize()) {
            // Coral case bar
            Column(Modifier.fillMaxWidth().background(kl.surface)
                .border(0.dp, Color.Transparent)) {
                Row(
                    Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(Modifier.size(24.dp).clickable(onClick = onExit), contentAlignment = Alignment.Center) {
                        Icon(KlIcons.close, "Exit case", tint = kl.muted, modifier = Modifier.size(22.dp))
                    }
                    KaribuMark(size = 20.dp, color = kl.primary)
                    com.karibuhealth.learn.OneLine(
                        case.title, color = kl.ink, fontSize = 13, fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    MonoMeta("${index + 1}/$total", color = kl.muted, size = 10)
                }
                // Progress segments
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 11.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    steps.forEachIndexed { si, _ ->
                        Box(Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(999.dp))
                            .background(if (si <= index) kl.primary else kl.line))
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(kl.line))

            // Scroll body
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll).padding(16.dp)) {
                step.chart?.let {
                    ChartFragment(
                        spec = it, patient = case.patient, revealed = revealed,
                        onCalc = if (it.sections.any { s -> s.calculator } && case.doseCalc != null) { { calcOpen = true } } else null,
                    )
                    Spacer(Modifier.height(16.dp))
                }

                // Coach badge
                Row(
                    Modifier.clip(RoundedCornerShape(999.dp)).background(kl.soft).padding(horizontal = 9.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(KlIcons.bulb, null, tint = kl.primary, modifier = Modifier.size(14.dp))
                    Text("KARIBULEARN COACH", fontFamily = MonoFamily, fontSize = 9.sp, fontWeight = FontWeight.Bold,
                        letterSpacing = 0.6.sp, color = kl.deep)
                }
                Spacer(Modifier.height(12.dp))

                Text(step.coach.eyebrow.uppercase(), fontFamily = MonoFamily, fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp, color = kl.primary)
                Spacer(Modifier.height(6.dp))
                Text(step.coach.title, color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 19.sp,
                    lineHeight = 23.sp, letterSpacing = (-0.02f).sp)
                if (step.coach.body.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(step.coach.body, color = kl.body, fontSize = 14.sp, lineHeight = 21.sp)
                }

                step.coach.quote?.let { quote ->
                    Spacer(Modifier.height(14.dp))
                    Row(
                        Modifier.fillMaxWidth().height(IntrinsicSize.Min)
                            .clip(RoundedCornerShape(topEnd = 10.dp, bottomEnd = 10.dp)).background(kl.wash),
                    ) {
                        Box(Modifier.width(3.dp).fillMaxHeight().background(kl.primary))
                        Text(quote, color = kl.ink, fontStyle = FontStyle.Italic, fontSize = 14.5f.sp, lineHeight = 21.sp,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
                    }
                }

                if (step.kind == StepKind.story && step.coach.teach != null && showTeaching) {
                    val teach = step.coach.teach!!
                    Spacer(Modifier.height(14.dp))
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(kl.soft)
                        .border(1.dp, kl.primary.copy(alpha = 0.15f), RoundedCornerShape(12.dp)).padding(14.dp)) {
                        Text(teach.label.uppercase(), fontFamily = MonoFamily, fontSize = 9.sp, fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp, color = kl.deep)
                        Spacer(Modifier.height(5.dp))
                        Text(teach.text, color = kl.body, fontSize = 13.sp, lineHeight = 20.sp)
                    }
                }

                if (step.kind == StepKind.decision) {
                    DecisionBlock(
                        step = step, answer = answers[index], answered = answered,
                        showCalc = step.chart?.sections?.any { it.calculator } == true && case.doseCalc != null,
                        onOpenCalc = { calcOpen = true },
                        onChoose = { oi ->
                            if (!answered) answers[index] = Answer(oi, step.question!!.options[oi].correct)
                        },
                    )
                }
                Spacer(Modifier.height(8.dp))
            }

            // Pinned continue
            Box(Modifier.fillMaxWidth().height(1.dp).background(kl.line))
            Box(Modifier.fillMaxWidth().background(kl.surface).padding(horizontal = 16.dp, vertical = 12.dp)) {
                if (step.kind == StepKind.decision && !answered) {
                    Text("Choose an answer to continue", color = kl.muted, fontSize = 12.5f.sp,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), textAlign = TextAlign.Center)
                } else {
                    val label = when {
                        index == total - 1 -> "Finish case"
                        step.kind == StepKind.story -> "Continue"
                        else -> "Next step"
                    }
                    com.karibuhealth.learn.KlButton(
                        text = label, trailingIcon = KlIcons.arrowRight, modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            if (index < total - 1) index++
                            else onComplete(answers.values.count { it.correct }, decisionTotal)
                        },
                    )
                }
            }
        }

        if (calcOpen && case.doseCalc != null) {
            DoseCalculatorSheet(spec = case.doseCalc!!, onClose = { calcOpen = false }, onUse = { _, _ -> calcOpen = false })
        }
    }
}

@Composable
private fun DecisionBlock(
    step: CaseStep,
    answer: Answer?,
    answered: Boolean,
    showCalc: Boolean,
    onOpenCalc: () -> Unit,
    onChoose: (Int) -> Unit,
) {
    val kl = LocalKl.current
    val q = step.question ?: return
    Spacer(Modifier.height(16.dp))
    Text(q.prompt, color = kl.ink, fontWeight = FontWeight.Bold, fontSize = 13.5f.sp)
    if (showCalc) {
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.clip(RoundedCornerShape(9.dp)).background(com.karibuhealth.learn.chart.CobaltSoft)
                .border(1.dp, com.karibuhealth.learn.chart.Cobalt.copy(alpha = 0.2f), RoundedCornerShape(9.dp))
                .clickable(onClick = onOpenCalc).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(KlIcons.calc, null, tint = com.karibuhealth.learn.chart.Cobalt, modifier = Modifier.size(15.dp))
            Text("Open dose calculator", color = com.karibuhealth.learn.chart.Cobalt, fontSize = 12.5f.sp, fontWeight = FontWeight.SemiBold)
        }
    }
    Spacer(Modifier.height(10.dp))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        q.options.forEachIndexed { oi, opt ->
            val mine = answer?.choice == oi
            var borderC = kl.line; var bgC = kl.surface; var textC = kl.ink; var badge: String? = null
            if (answered) {
                when {
                    opt.correct -> { borderC = Green; bgC = GreenSoft; textC = Green; badge = "✓" }
                    mine -> { borderC = kl.primary; bgC = kl.soft; textC = kl.deep; badge = "×" }
                    else -> textC = kl.muted
                }
            }
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(bgC)
                    .border(1.5.dp, borderC, RoundedCornerShape(11.dp))
                    .clickable(enabled = !answered) { onChoose(oi) }
                    .padding(horizontal = 12.dp, vertical = 11.dp),
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                Box(
                    Modifier.padding(top = 1.dp).size(19.dp).clip(RoundedCornerShape(999.dp))
                        .border(1.5.dp, if (answered && (opt.correct || mine)) borderC else kl.line, RoundedCornerShape(999.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(badge ?: ('A' + oi).toString(), color = textC, fontSize = 10.5f.sp, fontWeight = FontWeight.SemiBold)
                }
                Text(opt.text, color = textC, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
    if (answered && answer != null) {
        Spacer(Modifier.height(12.dp))
        val correct = answer.correct
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .background(if (correct) GreenSoft else kl.soft)
                .border(1.dp, if (correct) Green.copy(alpha = 0.27f) else kl.primary.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                .padding(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(if (correct) KlIcons.checkCircle else KlIcons.bulb, null,
                    tint = if (correct) Green else kl.deep, modifier = Modifier.size(15.dp))
                Text(if (correct) "CORRECT" else "NOT QUITE — HERE'S WHY", fontFamily = MonoFamily, fontSize = 9.5f.sp,
                    fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp, color = if (correct) Green else kl.deep)
            }
            Spacer(Modifier.height(5.dp))
            Text(if (correct) q.right else q.wrong, color = kl.body, fontSize = 13.sp, lineHeight = 20.sp)
        }
    }
}
