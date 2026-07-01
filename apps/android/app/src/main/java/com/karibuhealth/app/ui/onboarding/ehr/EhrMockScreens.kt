package com.karibuhealth.app.ui.onboarding.ehr

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalPharmacy
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.ListAlt
import androidx.compose.material.icons.outlined.People
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.karibuhealth.app.ui.theme.AmberInk
import com.karibuhealth.app.ui.theme.AmberSoft
import com.karibuhealth.app.ui.theme.Bg
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.GreenSoft
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.MonoFamily
import com.karibuhealth.app.ui.theme.Muted
import com.karibuhealth.app.ui.theme.Surface

/** Matches web `VitalsCard` field labels. */
private val VITALS_FIELDS = listOf(
    "Temp °C" to "37.8",
    "BP sys" to "",
    "BP dia" to "",
    "Pulse" to "88",
    "Resp" to "",
    "SpO₂ %" to "",
    "Weight kg" to "",
    "Height cm" to "",
    "MUAC cm" to "",
)

@Composable
fun EhrMockScreen(
    kind: EhrMockKind,
    activeStepId: String,
    onStepAction: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (kind) {
        EhrMockKind.Records -> RecordsDeskMock(activeStepId, onStepAction, modifier)
        EhrMockKind.Vitals -> VitalsMock(activeStepId, onStepAction, modifier)
        EhrMockKind.Clinician -> ClinicianNoteMock(activeStepId, onStepAction, modifier)
        EhrMockKind.Lab -> LabQueueMock(activeStepId, onStepAction, modifier)
        EhrMockKind.Pharmacy -> PharmacyMock(activeStepId, onStepAction, modifier)
        EhrMockKind.Billing -> BillingMock(activeStepId, onStepAction, modifier)
    }
}

@Composable
private fun MockShell(
    unitLabel: String,
    activeUnit: String = "opd",
    sidebarHighlight: String? = null,
    topTitle: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val units = listOf(
        "opd" to ("OPD" to Icons.Default.MedicalServices),
        "lab" to ("Lab" to Icons.Default.Science),
        "pharmacy" to ("Pharmacy" to Icons.Default.LocalPharmacy),
        "billing" to ("Billing" to Icons.Default.CreditCard),
    )
    val nav = listOf(
        "today" to ("Today" to Icons.Default.Home),
        "calendar" to ("Calendar" to Icons.Default.CalendarMonth),
        "patients" to ("Patients" to Icons.Outlined.People),
        "worklists" to ("Worklists" to Icons.Outlined.ListAlt),
        "orders" to ("Orders" to Icons.Outlined.Assignment),
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .background(Surface),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Surface)
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(18.dp).clip(RoundedCornerShape(4.dp)).background(Cobalt))
                Spacer(Modifier.width(4.dp))
                Text("KaribuEHR", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Cobalt)
            }
            Spacer(Modifier.width(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                units.forEach { (id, pair) ->
                    val (label, icon) = pair
                    Row(
                        Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (activeUnit == id) CobaltSoft else Color.Transparent)
                            .padding(horizontal = 6.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(icon, null, Modifier.size(12.dp), tint = if (activeUnit == id) Cobalt else Muted)
                        Spacer(Modifier.width(2.dp))
                        Text(label, fontSize = 9.sp, color = if (activeUnit == id) Cobalt else Muted)
                    }
                }
            }
        }

        Row(Modifier.fillMaxWidth()) {
            if (activeUnit == "opd") {
                Column(
                    Modifier
                        .width(88.dp)
                        .background(Bg.copy(alpha = 0.5f))
                        .padding(6.dp),
                ) {
                    Text("CLINIC", fontSize = 8.sp, fontWeight = FontWeight.SemiBold, color = Muted)
                    Text("Ssunga HC III", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                    Text(unitLabel, fontSize = 8.sp, fontWeight = FontWeight.SemiBold, color = Cobalt, modifier = Modifier.padding(bottom = 6.dp))
                    nav.forEach { (id, pair) ->
                        val (label, icon) = pair
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (sidebarHighlight == id) CobaltSoft else Color.Transparent)
                                .padding(horizontal = 4.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(icon, null, Modifier.size(12.dp), tint = if (sidebarHighlight == id) Cobalt else Muted)
                            Spacer(Modifier.width(4.dp))
                            Text(label, fontSize = 9.sp, color = if (sidebarHighlight == id) Cobalt else Muted)
                        }
                    }
                }
            }
            Column(
                Modifier
                    .weight(1f)
                    .background(Bg.copy(alpha = 0.35f))
                    .padding(8.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                topTitle?.let {
                    Text(it.uppercase(), fontSize = 8.sp, fontWeight = FontWeight.SemiBold, color = Muted, modifier = Modifier.padding(bottom = 4.dp))
                }
                content()
            }
        }
    }
}

@Composable
private fun MockBtn(
    text: String,
    onClick: () -> Unit,
    active: Boolean = false,
    variant: String = "primary",
    modifier: Modifier = Modifier,
) {
    val bg = when (variant) {
        "outline" -> Surface
        "ghost" -> CobaltSoft.copy(alpha = 0.5f)
        "green" -> Green
        "cobalt-soft" -> CobaltSoft
        else -> Cobalt
    }
    val fg = when (variant) {
        "outline", "ghost", "cobalt-soft" -> Cobalt
        "green" -> Color.White
        else -> Color.White
    }
    Text(
        text = text,
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .then(if (active) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)) else Modifier)
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        color = fg,
    )
}

@Composable
private fun MockField(label: String, value: String = "", highlight: Boolean = false) {
    Column(Modifier.padding(bottom = 4.dp)) {
        Text(label, fontSize = 9.sp, color = Muted)
        Text(
            value,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(6.dp))
                .then(if (highlight) Modifier.border(1.dp, Cobalt, RoundedCornerShape(6.dp)) else Modifier.border(1.dp, Line, RoundedCornerShape(6.dp)))
                .background(Surface)
                .padding(horizontal = 6.dp, vertical = 5.dp),
            fontSize = 10.sp,
            color = Ink,
        )
    }
}

@Composable
private fun RecordsDeskMock(activeStepId: String, onStepAction: (String) -> Unit, modifier: Modifier) {
    fun h(s: String) = activeStepId == s
    MockShell("OPD", sidebarHighlight = if (h("open-patients")) "patients" else null, topTitle = "Patients", modifier = modifier) {
        Text("Patients", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        if (h("open-patients")) {
            MockBtn("Open Patients", { onStepAction("open-patients") }, active = true, modifier = Modifier.padding(vertical = 4.dp))
        }
        Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(6.dp))
                    .then(if (h("search-first")) Modifier.border(2.dp, Cobalt, RoundedCornerShape(6.dp)) else Modifier.border(1.dp, Line, RoundedCornerShape(6.dp)))
                    .background(Surface)
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.Search, null, Modifier.size(14.dp), tint = Muted)
                Spacer(Modifier.width(4.dp))
                Text("Search name, patient #, phone…", fontSize = 10.sp, color = Muted)
            }
            if (h("search-first")) {
                Spacer(Modifier.width(4.dp))
                MockBtn("Search", { onStepAction("search-first") }, active = true, variant = "ghost")
            }
            Spacer(Modifier.width(4.dp))
            MockBtn("New Patient", { onStepAction("new-patient") }, active = h("new-patient"), variant = if (h("new-patient")) "primary" else "outline")
        }
        if (h("fill-form") || h("create-visit")) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, Line, RoundedCornerShape(8.dp))
                    .background(Surface)
                    .padding(8.dp),
            ) {
                Text("New patient", fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                Row(Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) { MockField("First Name *", "Grace", h("fill-form")) }
                    Spacer(Modifier.width(4.dp))
                    Column(Modifier.weight(1f)) { MockField("Last Name *", "Akello") }
                }
                MockField("Approximate age *", "34")
                MockField("Village", "Kapeeka")
                if (h("fill-form")) MockBtn("Details entered", { onStepAction("fill-form") }, active = true, modifier = Modifier.padding(top = 4.dp))
                if (h("create-visit")) MockBtn("Create Patient & Start Visit", { onStepAction("create-visit") }, active = true, modifier = Modifier.padding(top = 4.dp))
            }
        }
        if (activeStepId == "done") {
            Text("Grace Akello · Visit opened · Pending vitals", fontSize = 10.sp, color = Green, modifier = Modifier.padding(top = 6.dp).background(GreenSoft, RoundedCornerShape(8.dp)).padding(8.dp))
        }
    }
}

@Composable
private fun VitalsMock(activeStepId: String, onStepAction: (String) -> Unit, modifier: Modifier) {
    fun h(s: String) = activeStepId == s
    if (h("open-worklist")) {
        MockShell("OPD", sidebarHighlight = "worklists", topTitle = "Worklists", modifier = modifier) {
            Text("Pending vitals", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            Column(
                Modifier
                    .padding(top = 6.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .then(if (h("open-worklist")) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)) else Modifier.border(1.dp, Line, RoundedCornerShape(8.dp)))
                    .background(Surface)
                    .padding(8.dp),
            ) {
                Text("Nakato Mary", fontWeight = FontWeight.Medium, fontSize = 11.sp)
                Text("Fever 2 days · 12 min wait", fontSize = 10.sp, color = Muted)
                MockBtn("View worklist", { onStepAction("open-worklist") }, active = true, modifier = Modifier.padding(top = 4.dp))
            }
        }
        return
    }
    MockShell("OPD", topTitle = "Visit", modifier = modifier) {
        Text("Nakato Mary", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        if (h("open-visit")) MockBtn("Open visit", { onStepAction("open-visit") }, active = true, modifier = Modifier.padding(vertical = 4.dp))
        Column(Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, Line, RoundedCornerShape(8.dp)).background(Surface).padding(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Favorite, null, Modifier.size(14.dp), tint = Cobalt)
                    Spacer(Modifier.width(4.dp))
                    Text("Vitals", fontWeight = FontWeight.Medium, fontSize = 11.sp)
                }
                MockBtn("Record vitals", { onStepAction("record-vitals") }, active = h("record-vitals"), variant = "outline", modifier = Modifier)
            }
            if (h("enter-values") || h("save-vitals")) {
                Text("Every field is optional.", fontSize = 9.sp, color = Muted, modifier = Modifier.padding(vertical = 4.dp))
                Column(Modifier.then(if (h("enter-values")) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)).padding(4.dp) else Modifier)) {
                    VITALS_FIELDS.chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth()) {
                            row.forEach { (label, value) ->
                                Column(Modifier.weight(1f).padding(end = 4.dp)) { MockField(label, value) }
                            }
                        }
                    }
                }
                if (h("enter-values")) MockBtn("Values entered", { onStepAction("enter-values") }, active = true, modifier = Modifier.padding(top = 4.dp))
                if (h("save-vitals")) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        MockBtn("Save vitals", { onStepAction("save-vitals") }, active = true, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
        if (activeStepId == "done") Text("Worklist: Ready for clinician", fontSize = 10.sp, color = Green, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun ClinicianNoteMock(activeStepId: String, onStepAction: (String) -> Unit, modifier: Modifier) {
    fun h(s: String) = activeStepId == s
    MockShell("OPD", topTitle = "Visit", modifier = modifier) {
        Text("Nakato Mary", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        if (h("open-visit")) MockBtn("Open visit", { onStepAction("open-visit") }, active = true, modifier = Modifier.padding(vertical = 4.dp))
        listOf(
            "Chief complaint" to h("chief-complaint"),
            "Diagnosis" to h("diagnosis-plan"),
        ).forEach { (title, active) ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(bottom = 4.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .then(if (active) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)) else Modifier.border(1.dp, Line, RoundedCornerShape(8.dp)))
                    .background(Surface)
                    .padding(8.dp),
            ) {
                Text(title, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = Muted)
                if (active) MockBtn("Continue", { onStepAction(if (title == "Chief complaint") "chief-complaint" else "diagnosis-plan") }, active = true, modifier = Modifier.padding(top = 4.dp))
            }
        }
        if (h("order-labs")) {
            Column(Modifier.fillMaxWidth().padding(bottom = 4.dp).clip(RoundedCornerShape(8.dp)).background(CobaltSoft.copy(alpha = 0.35f)).padding(8.dp)) {
                Text("Order lab tests", fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                MockBtn("Send to lab", { onStepAction("order-labs") }, variant = "outline", modifier = Modifier.padding(top = 4.dp))
            }
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .then(if (h("send-pharmacy")) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)) else Modifier.border(1.dp, Line, RoundedCornerShape(8.dp)))
                .background(CobaltSoft.copy(alpha = 0.35f))
                .padding(8.dp),
        ) {
            Text("Structured prescriptions", fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Text("Paracetamol 500mg · Amoxicillin 250mg", fontSize = 10.sp, modifier = Modifier.padding(vertical = 2.dp))
            if (h("send-pharmacy")) MockBtn("Send to pharmacy", { onStepAction("send-pharmacy") }, active = true, modifier = Modifier.padding(top = 4.dp))
        }
        if (activeStepId == "done") MockBtn("Sign note", {}, variant = "outline", modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun LabQueueMock(activeStepId: String, onStepAction: (String) -> Unit, modifier: Modifier) {
    fun h(s: String) = activeStepId == s
    MockShell("LAB", activeUnit = "lab", topTitle = "Today · Laboratory orders", modifier = modifier) {
        if (h("open-lab")) MockBtn("View lab queue", { onStepAction("open-lab") }, active = true, modifier = Modifier.padding(bottom = 6.dp))
        Column(Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, Line, RoundedCornerShape(8.dp)).background(Surface)) {
            Text("Pending + running", fontWeight = FontWeight.SemiBold, fontSize = 11.sp, modifier = Modifier.padding(8.dp))
            Text("Nakato Mary", fontWeight = FontWeight.Medium, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
                    .then(if (h("start-test") || h("enter-result") || h("save-result")) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)).padding(4.dp) else Modifier),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Malaria RDT", Modifier.weight(1f), fontSize = 10.sp)
                if (h("start-test")) MockBtn("Start", { onStepAction("start-test") }, active = true, variant = "cobalt-soft")
                if (h("enter-result")) {
                    MockBtn("Positive", { onStepAction("enter-result") }, variant = "outline", modifier = Modifier.padding(horizontal = 2.dp))
                    MockBtn("Negative", {}, variant = "outline")
                }
                if (h("save-result")) MockBtn("Save", { onStepAction("save-result") }, active = true, variant = "green")
            }
        }
    }
}

@Composable
private fun PharmacyMock(activeStepId: String, onStepAction: (String) -> Unit, modifier: Modifier) {
    fun h(s: String) = activeStepId == s
    MockShell("PHARMACY · DISPENSING", activeUnit = "pharmacy", modifier = modifier) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(bottom = 6.dp)) {
            listOf("Waiting (1)" to true, "In progress (0)" to false, "Done today (0)" to false).forEach { (label, active) ->
                Text(
                    label,
                    fontSize = 9.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (active) Cobalt else Bg)
                        .then(if (h("open-pharmacy") && active) Modifier.border(2.dp, Cobalt, RoundedCornerShape(12.dp)) else Modifier)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    color = if (active) Color.White else Muted,
                )
            }
        }
        if (h("open-pharmacy")) MockBtn("Open pharmacy queue", { onStepAction("open-pharmacy") }, active = true, modifier = Modifier.padding(bottom = 6.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .then(if (h("select-order") || h("dispense")) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)) else Modifier.border(1.dp, Line, RoundedCornerShape(8.dp)))
                .background(Surface)
                .padding(8.dp),
        ) {
            Text("Nakato Mary", fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
            Text("Paracetamol · Amoxicillin", fontSize = 10.sp, color = Body)
            if (h("select-order")) MockBtn("Open worksheet", { onStepAction("select-order") }, active = true, modifier = Modifier.padding(top = 4.dp))
            if (h("dispense")) MockBtn("Dispense & complete", { onStepAction("dispense") }, active = true, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun BillingMock(activeStepId: String, onStepAction: (String) -> Unit, modifier: Modifier) {
    fun h(s: String) = activeStepId == s
    if (h("open-billing")) {
        MockShell("PATIENT BILLS", activeUnit = "billing", topTitle = "Payments", modifier = modifier) {
            MockBtn("Open payments desk", { onStepAction("open-billing") }, active = true, modifier = Modifier.padding(bottom = 6.dp))
            Column(Modifier.clip(RoundedCornerShape(8.dp)).border(1.dp, Line, RoundedCornerShape(8.dp)).background(Surface).padding(8.dp)) {
                Text("Patients with balance", fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Nakato Mary", fontSize = 10.sp)
                    Text("UGX 13,000 owed", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = AmberInk)
                }
            }
        }
        return
    }
    MockShell("PATIENT BILL", activeUnit = "billing", modifier = modifier) {
        Text("Nakato Mary", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
        if (h("find-patient")) MockBtn("Open patient bill", { onStepAction("find-patient") }, active = true, modifier = Modifier.padding(vertical = 4.dp))
        if (h("record-payment") || activeStepId == "done") {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .then(if (h("record-payment")) Modifier.border(2.dp, Cobalt, RoundedCornerShape(8.dp)) else Modifier.border(1.dp, Line, RoundedCornerShape(8.dp)))
                    .background(Surface)
                    .padding(8.dp),
            ) {
                Text("Record payment", fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                MockField("Method", "Cash")
                MockField("Cash / mobile (UGX)", "13,000")
                if (h("record-payment")) MockBtn("Record payment", { onStepAction("record-payment") }, active = true, modifier = Modifier.padding(top = 4.dp))
            }
        }
        if (activeStepId == "done") Text("Receipt printed · balance UGX 0", fontSize = 10.sp, color = Green, modifier = Modifier.padding(top = 6.dp))
    }
}
