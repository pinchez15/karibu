package com.karibuhealth.learn.walkthrough

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.learn.KlIcons
import com.karibuhealth.learn.MonoMeta
import com.karibuhealth.learn.model.AiBanner
import com.karibuhealth.learn.model.ChartSection
import com.karibuhealth.learn.model.ChartSpec
import com.karibuhealth.learn.model.CasePatient
import com.karibuhealth.learn.model.Critical
import com.karibuhealth.learn.model.HmisCode
import com.karibuhealth.learn.model.OrderRow
import com.karibuhealth.learn.model.Vital
import com.karibuhealth.learn.chart.Amber
import com.karibuhealth.learn.chart.AmberInk
import com.karibuhealth.learn.chart.AmberSoft
import com.karibuhealth.learn.chart.Bg
import com.karibuhealth.learn.chart.Body
import com.karibuhealth.learn.chart.Cobalt
import com.karibuhealth.learn.chart.CobaltInk
import com.karibuhealth.learn.chart.CobaltSoft
import com.karibuhealth.learn.chart.Green
import com.karibuhealth.learn.chart.GreenSoft
import com.karibuhealth.learn.chart.Ink
import com.karibuhealth.learn.chart.KaribuMark
import com.karibuhealth.learn.chart.Line
import com.karibuhealth.learn.chart.LineSoft
import com.karibuhealth.learn.chart.MonoFamily
import com.karibuhealth.learn.chart.Muted
import com.karibuhealth.learn.chart.Red
import com.karibuhealth.learn.chart.RedSoft
import com.karibuhealth.learn.chart.Surface

/**
 * The cobalt KaribuEHR "chart card" shown inside a case step. Deliberately
 * cobalt — the learner is looking at the real product. amber = AI and
 * brick-red = clinical critical stay reserved exactly as in the EHR.
 *
 * Fully data-driven: it renders whatever [ChartSpec.sections] the case author
 * (the pipeline) provides. [revealed] toggles each section's before/after
 * state — story steps are always revealed; decision steps reveal on answer.
 */
@Composable
fun ChartFragment(
    spec: ChartSpec,
    patient: CasePatient,
    revealed: Boolean,
    modifier: Modifier = Modifier,
    onCalc: (() -> Unit)? = null,
    orderedTests: Set<String>? = null,
    onOrderTest: ((String) -> Unit)? = null,
    selectedCodes: Set<String>? = null,
    onSelectCode: ((String) -> Unit)? = null,
) {
    val shape = RoundedCornerShape(14.dp)
    val internalOrdered = remember(spec) { mutableStateOf(mutableSetOf<String>()) }
    val internalSelected = remember(spec) { mutableStateOf(mutableSetOf<String>()) }
    val tests = orderedTests ?: internalOrdered.value
    val codes = selectedCodes ?: internalSelected.value
    val orderHandler: (String) -> Unit = onOrderTest ?: { name ->
        internalOrdered.value = internalOrdered.value.toMutableSet().apply { add(name) }
    }
    val selectHandler: (String) -> Unit = onSelectCode ?: { code ->
        internalSelected.value = internalSelected.value.toMutableSet().apply { add(code) }
    }
    Column(
        modifier
            .clip(shape)
            .border(1.dp, Line, shape)
            .background(Surface),
    ) {
        ChartChrome(tag = spec.tag)
        PatientStrip(patient)
        Column(Modifier.padding(12.dp)) {
            spec.sections.forEachIndexed { i, section ->
                if (i > 0) Spacer(Modifier.height(10.dp))
                ChartSectionView(
                    section = section,
                    revealed = revealed,
                    onCalc = onCalc,
                    orderedTests = tests,
                    selectedCodes = codes,
                    onOrderTest = orderHandler,
                    onSelectCode = selectHandler,
                )
            }
        }
    }
}

@Composable
private fun ChartChrome(tag: String) {
    Row(
        Modifier.fillMaxWidth().background(CobaltInk).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        KaribuMark(size = 15.dp, color = Color.White, fg = Cobalt)
        Text(buildString { append("Karibu") }, color = Color.White, fontSize = 11.5f.sp, fontWeight = FontWeight.Bold)
        Text(".health", color = Color.White.copy(alpha = 0.7f), fontSize = 11.5f.sp, fontWeight = FontWeight.Medium)
        Text(
            "SIMULATION", fontFamily = MonoFamily, fontSize = 8.5f.sp,
            letterSpacing = 0.7.sp, color = Color.White.copy(alpha = 0.5f),
        )
        Spacer(Modifier.weight(1f))
        if (tag.isNotBlank()) {
            Text(
                tag, fontFamily = MonoFamily, fontSize = 9.sp, letterSpacing = 0.5.sp, color = Color.White,
                modifier = Modifier.clip(RoundedCornerShape(5.dp))
                    .background(Color.White.copy(alpha = 0.12f)).padding(horizontal = 7.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun PatientStrip(patient: CasePatient) {
    Row(
        Modifier.fillMaxWidth().background(Bg).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        val initials = patient.name.split(" ").mapNotNull { it.firstOrNull() }.take(2)
            .joinToString("").uppercase()
        Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(7.dp)).background(CobaltSoft),
            contentAlignment = Alignment.Center,
        ) { Text(initials, color = Cobalt, fontWeight = FontWeight.Bold, fontSize = 11.sp) }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(patient.name, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                MonoMeta(patient.age, color = Muted, size = 10)
            }
            MonoMeta("${patient.id ?: "—"} · SIMULATION", color = Muted, size = 9)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.size(5.dp).clip(RoundedCornerShape(999.dp)).background(Green))
            MonoMeta("SAVED", color = Green, size = 9)
        }
    }
}

@Composable
private fun SectionLabel(title: String?, right: (@Composable () -> Unit)? = null) {
    if (title == null && right == null) return
    Row(
        Modifier.fillMaxWidth().padding(bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            title?.uppercase() ?: "", fontFamily = MonoFamily, fontSize = 9.5f.sp,
            fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, color = Muted,
        )
        right?.invoke()
    }
}

@Composable
private fun ChartSectionView(
    section: ChartSection,
    revealed: Boolean,
    onCalc: (() -> Unit)?,
    orderedTests: Set<String>,
    selectedCodes: Set<String>,
    onOrderTest: (String) -> Unit,
    onSelectCode: (String) -> Unit,
) {
    val s = section
    when (s.type) {
        "chiefComplaint" -> {
            SectionLabel(s.title ?: "CHIEF COMPLAINT")
            Text(s.text.orEmpty(), color = Ink, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 19.sp)
            if (s.chips.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    s.chips.forEach { ChartChip(it) }
                }
            }
        }
        "keyValues" -> {
            SectionLabel(s.title)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                s.rows.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        pair.forEach { kv ->
                            Row(
                                Modifier.weight(1f).border(0.dp, Color.Transparent)
                                    .padding(bottom = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(kv.label, color = Muted, fontSize = 12.sp)
                                MonoMeta(kv.value, color = Body, size = 12)
                            }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
        "vitals" -> {
            SectionLabel(s.title ?: "VITALS", right = s.rightLabel?.let { { MonoMeta(it, color = Muted, size = 8) } })
            VitalsGrid(s.vitals)
            s.critical?.let { Spacer(Modifier.height(8.dp)); CriticalRow(it) }
        }
        "subjective" -> {
            SectionLabel(s.title ?: "SUBJECTIVE")
            val extra = if (revealed) s.revealText else null
            Text(
                buildAnnotated(s.text.orEmpty(), extra),
                color = Body, fontSize = 13.sp, lineHeight = 19.sp,
            )
        }
        "dangerScreen" -> {
            SectionLabel(s.title ?: "DANGER-SIGN SCREEN")
            DangerScreen(s.dangerSigns, revealed)
            if (revealed && s.revealNote != null) {
                Spacer(Modifier.height(7.dp))
                Text(s.revealNote.uppercase(), fontFamily = MonoFamily, fontSize = 9.5f.sp, color = Green)
            }
        }
        "assessment" -> {
            SectionLabel(s.title ?: "ASSESSMENT")
            Text(buildAnnotated(s.text.orEmpty(), s.emphasis), color = Body, fontSize = 13.sp, lineHeight = 19.sp)
        }
        "investigations" -> {
            SectionLabel(s.title ?: "INVESTIGATIONS")
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                s.orders.forEach { order ->
                    OrderRowView(
                        o = order,
                        revealed = revealed,
                        locallyOrdered = orderedTests.contains(order.name),
                        onOrder = { if (!revealed && order.status == "order") onOrderTest(order.name) },
                    )
                }
            }
        }
        "result" -> {
            SectionLabel(s.title ?: "RESULT", right = s.rightLabel?.let { { MonoMeta(it, color = Green, size = 8) } })
            ResultView(s.resultLabel.orEmpty(), s.resultValue.orEmpty(), s.badge)
            s.ai?.let { Spacer(Modifier.height(10.dp)); AiBannerView(it) }
        }
        "prescription" -> {
            SectionLabel(
                s.title ?: "PRESCRIPTION",
                right = if (s.calculator && onCalc != null) {
                    { CalcChip(onCalc) }
                } else null,
            )
            PrescriptionView(s, revealed)
            if (s.counselling.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                SectionLabel("COUNSELLING")
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    s.counselling.forEach { c ->
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("·", color = Muted, fontSize = 12.sp)
                            Text(c, color = Body, fontSize = 12.sp, lineHeight = 18.sp)
                        }
                    }
                }
            }
        }
        "diagnosis" -> {
            SectionLabel(s.title ?: "HMIS CODES")
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                s.codes.forEach { code ->
                    HmisCodeView(
                        c = code,
                        revealed = revealed,
                        selected = selectedCodes.contains(code.code),
                        onSelect = { if (!revealed) onSelectCode(code.code) },
                    )
                }
            }
            if (revealed && s.receipt != null) {
                Spacer(Modifier.height(10.dp))
                SectionLabel("RECEIPT PREVIEW")
                Text(
                    s.receipt,
                    fontFamily = MonoFamily, fontSize = 10.5f.sp, color = Body, lineHeight = 18.sp,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(7.dp)).background(Bg)
                        .border(1.dp, Line, RoundedCornerShape(7.dp)).padding(10.dp),
                )
            }
        }
        else -> {
            // Unknown section type — render its text if any, otherwise skip.
            s.title?.let { SectionLabel(it) }
            s.text?.let { Text(it, color = Body, fontSize = 13.sp, lineHeight = 19.sp) }
        }
    }
}

private fun buildAnnotated(base: String, emphasis: String?): String =
    if (emphasis.isNullOrBlank()) base else "$base $emphasis"

@Composable
private fun ChartChip(text: String) {
    Text(
        text, color = Body, fontSize = 10.5f.sp,
        modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(Bg)
            .border(1.dp, Line, RoundedCornerShape(999.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

@Composable
private fun VitalsGrid(vitals: List<Vital>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        vitals.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { v -> Box(Modifier.weight(1f)) { VitalChip(v) } }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun VitalChip(v: Vital) {
    val hot = v.hot
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
            .background(if (hot) AmberSoft else Bg)
            .border(1.dp, if (hot) Amber.copy(alpha = 0.4f) else Line, RoundedCornerShape(8.dp))
            .padding(horizontal = 9.dp, vertical = 6.dp),
    ) {
        Text(v.label, fontFamily = MonoFamily, fontSize = 8.5f.sp, fontWeight = FontWeight.SemiBold,
            color = if (hot) Amber else Muted, letterSpacing = 0.4.sp)
        Text(v.value, fontFamily = MonoFamily, fontSize = 14.sp, fontWeight = FontWeight.Bold,
            color = if (hot) Amber else Ink)
    }
}

@Composable
private fun CriticalRow(c: Critical) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(Color(0xFFFEF3F2))
            .border(1.dp, Red.copy(alpha = 0.25f), RoundedCornerShape(9.dp)).padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Box(Modifier.padding(top = 5.dp).size(7.dp).clip(RoundedCornerShape(999.dp)).background(Red))
        Column {
            Text("CRITICAL · ${c.count} FINDING".let { if (c.count == 1) it else it + "S" },
                fontFamily = MonoFamily, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp, color = Red)
            Text(c.title, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 17.sp)
            c.body?.let { Text(it, color = Body, fontSize = 11.5f.sp, lineHeight = 16.sp) }
        }
    }
}

@Composable
private fun DangerScreen(items: List<String>, revealed: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { d ->
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(
                            Modifier.size(15.dp).clip(RoundedCornerShape(4.dp))
                                .background(if (revealed) GreenSoft else Surface)
                                .border(1.dp, if (revealed) Green else Line, RoundedCornerShape(4.dp)),
                            contentAlignment = Alignment.Center,
                        ) { if (revealed) Text("−", color = Green, fontSize = 11.sp) }
                        com.karibuhealth.learn.OneLine(d, color = Body, fontSize = 11)
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun OrderRowView(
    o: OrderRow,
    revealed: Boolean,
    locallyOrdered: Boolean = false,
    onOrder: (() -> Unit)? = null,
) {
    val status = when {
        revealed -> o.revealStatus ?: o.status
        locallyOrdered || o.status == "pending" -> "pending"
        else -> o.status
    }
    val sub = if (revealed) (o.revealSub ?: o.sub) else o.sub
    val active = revealed && o.revealStatus != null
    val isOrderButton = !revealed && o.status == "order" && !locallyOrdered
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
            .background(if (active || locallyOrdered) CobaltSoft.copy(alpha = 0.44f) else Surface)
            .border(1.dp, if (active || locallyOrdered || isOrderButton) Cobalt else Line, RoundedCornerShape(8.dp))
            .then(if (isOrderButton && onOrder != null) Modifier.clickable(onClick = onOrder) else Modifier)
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(Modifier.weight(1f)) {
            Text(o.name, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5f.sp)
            sub?.let { MonoMeta(it, color = Muted, size = 9) }
        }
        when {
            isOrderButton -> OrderActionButton("Order test")
            status == "pending" -> StatusPill("Pending", Amber, AmberSoft)
            status == "done" -> StatusPill("Done", Green, GreenSoft)
            else -> StatusPill("Ordered", Cobalt, CobaltSoft)
        }
    }
}

@Composable
private fun OrderActionButton(label: String) {
    Text(
        label,
        color = Color.White,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Cobalt)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun StatusPill(text: String, fg: Color, bg: Color) {
    Text(
        text, color = fg, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(bg).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

@Composable
private fun ResultView(label: String, value: String, badge: String?) {
    Row(
        Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, color = Muted, fontSize = 12.sp)
            Text(value, color = Ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
        badge?.let {
            Text(it, color = Red, fontWeight = FontWeight.Bold, fontSize = 11.sp,
                modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(RedSoft).padding(horizontal = 10.dp, vertical = 4.dp))
        }
    }
}

@Composable
private fun AiBannerView(ai: AiBanner) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .border(1.5.dp, Amber, RoundedCornerShape(10.dp)),
    ) {
        ShimmerLine()
        Column(Modifier.background(AmberSoft.copy(alpha = 0.44f)).padding(horizontal = 12.dp, vertical = 11.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(KlIcons.sparkle, null, tint = Amber, modifier = Modifier.size(14.dp))
                Text("AI ASSISTANT", fontFamily = MonoFamily, fontSize = 9.5f.sp, fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp, color = Amber)
            }
            Spacer(Modifier.height(4.dp))
            Text(ai.headline, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5f.sp, lineHeight = 17.sp)
            ai.sub?.let { Text(it, color = AmberInk, fontSize = 11.sp, lineHeight = 15.sp) }
        }
    }
}

/** The 2px amber shimmer that runs along an AI card's top edge while it works. */
@Composable
private fun ShimmerLine() {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -1f, targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1600), RepeatMode.Restart), label = "x",
    )
    Box(
        Modifier.fillMaxWidth().height(2.dp).background(
            Brush.horizontalGradient(
                0f to Color.Transparent, 0.5f to Amber, 1f to Color.Transparent,
                startX = x * 400f, endX = x * 400f + 400f,
            ),
        ),
    )
}

@Composable
private fun CalcChip(onCalc: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(6.dp)).background(CobaltSoft)
            .border(1.dp, Cobalt.copy(alpha = 0.2f), RoundedCornerShape(6.dp))
            .clickable(onClick = onCalc).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(KlIcons.calc, null, tint = Cobalt, modifier = Modifier.size(12.dp))
        Text("Calculator", color = Cobalt, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PrescriptionView(s: ChartSection, revealed: Boolean) {
    val detail = if (revealed) (s.revealDetail ?: s.detail) else s.detail
    val confirmed = revealed && s.confirmedOnReveal
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
            .background(if (revealed) CobaltSoft.copy(alpha = 0.33f) else Surface)
            .border(1.dp, if (revealed) Cobalt else Line, RoundedCornerShape(9.dp))
            .padding(11.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(s.drug.orEmpty(), color = Ink, fontWeight = FontWeight.Bold, fontSize = 13.5f.sp)
                detail?.let { Text(it, color = Body, fontSize = 12.sp, lineHeight = 17.sp) }
            }
            StatusPill(if (confirmed) "Confirmed" else "Draft", if (confirmed) Green else Muted,
                if (confirmed) GreenSoft else Bg)
        }
    }
}

@Composable
private fun HmisCodeView(
    c: HmisCode,
    revealed: Boolean,
    selected: Boolean = false,
    onSelect: (() -> Unit)? = null,
) {
    val on = (revealed && c.primary) || selected
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
            .background(if (on) CobaltSoft.copy(alpha = 0.4f) else Surface)
            .border(1.dp, if (on) Cobalt else Line, RoundedCornerShape(8.dp))
            .then(if (!revealed && onSelect != null) Modifier.clickable(onClick = onSelect) else Modifier)
            .padding(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween) {
            Text(c.code, fontFamily = MonoFamily, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Cobalt)
            if (!revealed && !selected) {
                Text("Select", color = Cobalt, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(CobaltSoft)
                        .padding(horizontal = 8.dp, vertical = 3.dp))
            }
            c.confidence?.let {
                Text("AI $it", fontFamily = MonoFamily, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = Amber,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(AmberSoft).padding(horizontal = 6.dp, vertical = 2.dp))
            }
        }
        Text(c.name, color = Body, fontSize = 12.sp)
        if (on) Text(if (revealed && c.primary) "Primary diagnosis" else "Selected", color = Cobalt, fontSize = 10.5f.sp, fontWeight = FontWeight.SemiBold)
    }
}
