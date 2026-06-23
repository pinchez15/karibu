package com.karibuhealth.app.ui.inpatient

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.weight
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import com.karibuhealth.app.ui.inpatient.chart.AdmissionLabPanel
import com.karibuhealth.app.ui.inpatient.chart.ClinicalDock
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.data.local.db.entity.AdmissionObservationEntity
import com.karibuhealth.app.domain.InpatientDangerSigns
import java.time.Duration
import java.time.Instant

private enum class ChartTab(val label: String) {
    ROUNDS("Rounds"),
    MEDS("Meds"),
    ORDERS("Lab/Rx"),
    MATERNITY("Maternity"),
    NOTES("Notes"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdmissionChartScreen(
    onNavigateBack: () -> Unit,
    viewModel: AdmissionChartViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    var showSheet by remember { mutableStateOf(false) }
    var showAddMed by remember { mutableStateOf(false) }
    var notGivenForOrder by remember { mutableStateOf<String?>(null) }
    var skipDoseScheduledFor by remember { mutableStateOf<String?>(null) }
    var selectedTab by remember { mutableStateOf(ChartTab.ROUNDS) }
    var showDischarge by remember { mutableStateOf(false) }
    var showRefer by remember { mutableStateOf(false) }
    var showDelivery by remember { mutableStateOf(false) }
    var showAddNote by remember { mutableStateOf(false) }
    var postnatalSubject by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }

    // Close the record sheet only once a round actually saves.
    androidx.compose.runtime.LaunchedEffect(s.savedTick) {
        if (s.savedTick > 0) showSheet = false
    }
    // Leave the chart once the admission is discharged/transferred.
    androidx.compose.runtime.LaunchedEffect(s.closed) {
        if (s.closed) onNavigateBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(s.admission?.patientName ?: "Admission") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "More")
                    }
                    androidx.compose.material3.DropdownMenu(
                        expanded = menuOpen,
                        onDismissRequest = { menuOpen = false },
                    ) {
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("Refer out") },
                            onClick = { menuOpen = false; showRefer = true },
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("Discharge") },
                            onClick = { menuOpen = false; showDischarge = true },
                        )
                    }
                },
            )
        },
    ) { padding ->
        val activeOrders = s.medicationOrders.filter { it.active }
    val isMaternity = s.admission?.ward == "maternity"
    val tabs = buildList {
        add(ChartTab.ROUNDS)
        add(ChartTab.MEDS)
        add(ChartTab.ORDERS)
        if (isMaternity) add(ChartTab.MATERNITY)
        add(ChartTab.NOTES)
    }
    androidx.compose.runtime.LaunchedEffect(isMaternity) {
        if (selectedTab == ChartTab.MATERNITY && !isMaternity) selectedTab = ChartTab.ROUNDS
    }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            s.admission?.let { a ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        val meta = listOfNotNull(
                            if (a.ward == "maternity") "Maternity" else "General",
                            a.bedLabel?.let { "Bed $it" },
                            a.weightKg?.let { "${it} kg" },
                        ).joinToString(" · ")
                        Text(meta, fontWeight = FontWeight.Medium)
                        a.chiefComplaint?.takeIf { it.isNotBlank() }?.let {
                            Text("Reason: $it", style = MaterialTheme.typography.bodyMedium)
                        }
                        if (!a.isSynced) {
                            Text(
                                "Saved on device — will sync when online.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            if (s.dangerFindings.isNotEmpty()) {
                DangerSignBanner(findings = s.dangerFindings)
            }

            ClinicalDock(
                latestObs = s.observations.firstOrNull(),
                doseSchedule = s.doseSchedule,
                ivInfusions = s.ivInfusions,
                isSaving = s.isSaving,
                onQuickVitals = viewModel::recordQuickVitals,
                onGiveDose = { orderId, scheduledFor ->
                    viewModel.recordDose(
                        orderId,
                        given = true,
                        scheduledFor = scheduledFor.takeIf { it.isNotBlank() },
                    )
                },
                onSkipDose = { orderId, scheduledFor ->
                    notGivenForOrder = orderId
                    skipDoseScheduledFor = scheduledFor.takeIf { it.isNotBlank() }
                },
                onStartIv = { fluid, vol, add, rate, drops, site, notes ->
                    viewModel.startIvInfusion(fluid, vol, add, rate, drops, site, notes)
                },
                onIvCheck = { id, running, siteOk ->
                    viewModel.recordIvCheck(id, running, siteOk, null)
                },
                onStopIv = viewModel::stopIvInfusion,
            )

            TabRow(selectedTabIndex = tabs.indexOf(selectedTab).coerceAtLeast(0)) {
                tabs.forEach { tab ->
                    Tab(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        text = { Text(tab.label) },
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when (selectedTab) {
                    ChartTab.ROUNDS -> {
                        item(key = "full-round") {
                            Button(onClick = { showSheet = true }, modifier = Modifier.fillMaxWidth()) {
                                Text("Full round (IMCI / AVPU / SpO₂)")
                            }
                        }
                        if (s.observations.isEmpty()) {
                            item(key = "rounds-empty") {
                                Text(
                                    "No observations yet.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        } else {
                            items(s.observations, key = { "obs-${it.id}" }) { obs -> ObservationRow(obs) }
                        }
                    }
                    ChartTab.MEDS -> {
                        item(key = "tx-header") {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                            ) {
                                Text("All medications", style = MaterialTheme.typography.labelLarge)
                                TextButton(onClick = { showAddMed = true }) { Text("Add") }
                            }
                        }
                        if (activeOrders.isEmpty()) {
                            item(key = "tx-empty") {
                                Text(
                                    "No active medications.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        } else {
                            items(activeOrders, key = { "order-${it.id}" }) { order ->
                                MedicationOrderCard(
                                    order = order,
                                    lastAdmin = s.medicationAdmins.firstOrNull { it.orderId == order.id },
                                    onGive = { viewModel.recordDose(order.id, given = true) },
                                    onNotGiven = { notGivenForOrder = order.id },
                                    onStop = { viewModel.stopMedicationOrder(order.id) },
                                )
                            }
                        }
                    }
                    ChartTab.ORDERS -> {
                        item(key = "lab-order") {
                            AdmissionLabPanel(
                                enabled = s.labOrdersOnline && s.inpatientVisitId != null,
                                testsOrdered = s.inpatientTestsOrdered,
                                onSubmit = viewModel::submitLabOrder,
                            )
                        }
                    }
                    ChartTab.MATERNITY -> {
                        items(s.maternalAlerts, key = { "maternal-${it.slug}" }) { alert ->
                            MaternalAlertBanner(alert)
                        }
                        if (s.newbornFindings.isNotEmpty()) {
                            item(key = "newborn-danger") { NewbornDangerBanner(s.newbornFindings) }
                        }
                        item(key = "delivery") {
                            DeliverySummaryCard(
                                delivery = s.delivery,
                                onRecord = { showDelivery = true },
                            )
                        }
                        item(key = "postnatal") {
                            PostnatalCard(
                                rounds = s.postnatalObs,
                                onRecordMother = { postnatalSubject = "mother" },
                                onRecordNewborn = { postnatalSubject = "newborn" },
                            )
                        }
                    }
                    ChartTab.NOTES -> {
                        item(key = "notes-header") {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                            ) {
                                Text("Progress notes", style = MaterialTheme.typography.labelLarge)
                                TextButton(onClick = { showAddNote = true }) { Text("Add note") }
                            }
                        }
                        if (s.notes.isEmpty()) {
                            item(key = "notes-empty") {
                                Text(
                                    "No progress notes yet.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        } else {
                            items(s.notes, key = { "note-${it.id}" }) { note -> ProgressNoteRow(note) }
                        }
                    }
                }
            }
        }
    }

    if (showAddMed) {
        AddMedicationSheet(
            onDismiss = { showAddMed = false },
            onAdd = { drug, dose, route, freq, instr ->
                viewModel.addMedicationOrder(drug, dose, route, freq, instr)
                showAddMed = false
            },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }

    notGivenForOrder?.let { orderId ->
        NotGivenReasonDialog(
            onDismiss = { notGivenForOrder = null; skipDoseScheduledFor = null },
            onPick = { reason ->
                viewModel.recordDose(
                    orderId,
                    given = false,
                    notGivenReason = reason,
                    scheduledFor = skipDoseScheduledFor,
                )
                notGivenForOrder = null
                skipDoseScheduledFor = null
            },
        )
    }

    if (showDischarge) {
        DischargeSheet(
            onDismiss = { showDischarge = false },
            onDischarge = { outcome, disposition, notes ->
                viewModel.discharge(outcome, disposition, notes)
                showDischarge = false
            },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }

    if (showRefer) {
        ReferOutSheet(
            onDismiss = { showRefer = false },
            onRefer = { facility, urgency, reason, transport ->
                viewModel.refer(facility, urgency, reason, transport)
                showRefer = false
            },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }

    postnatalSubject?.let { subject ->
        PostnatalSheet(
            subject = subject,
            onDismiss = { postnatalSubject = null },
            onSave = { temp, pulse, rr, sys, dia, bleeding, fundus, feedingWell, notFeeding, convulsions, jaundice, note ->
                viewModel.recordPostnatalObs(
                    subject, temp, pulse, rr, sys, dia, bleeding, fundus, feedingWell, notFeeding, convulsions, jaundice, note,
                )
                postnatalSubject = null
            },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }

    if (showAddNote) {
        AddNoteSheet(
            onDismiss = { showAddNote = false },
            onSave = { text -> viewModel.addNote(text); showAddNote = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }

    if (showDelivery) {
        DeliverySheet(
            existing = s.delivery,
            onDismiss = { showDelivery = false },
            onSave = { mode, outcome, sex, weight, ap1, ap5, oxy, loss, placenta, resus, vitK, bf, notes ->
                viewModel.recordDelivery(
                    mode, outcome, sex, weight, ap1, ap5, oxy, loss, placenta, resus, vitK, bf, notes,
                )
                showDelivery = false
            },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }

    if (showSheet) {
        RecordObservationSheet(
            onDismiss = { showSheet = false },
            onSave = { input -> viewModel.recordObservation(input) },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }

    // On-entry sanity confirm: implausible value(s) detected.
    if (s.pendingWarnings.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = viewModel::dismissWarnings,
            title = { Text("Check these values") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    s.pendingWarnings.forEach { Text("• $it") }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    // The input that tripped the check is held in the VM; save it.
                    viewModel.confirmSave()
                    showSheet = false
                }) { Text("Save anyway") }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissWarnings) { Text("Go back") }
            },
        )
    }
}

@Composable
private fun MedicationOrderCard(
    order: com.karibuhealth.app.data.local.db.entity.MedicationOrderEntity,
    lastAdmin: com.karibuhealth.app.data.local.db.entity.MedicationAdministrationEntity?,
    onGive: () -> Unit,
    onNotGiven: () -> Unit,
    onStop: () -> Unit,
) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            val detail = listOfNotNull(order.dose, order.route, order.frequency)
                .filter { it.isNotBlank() }.joinToString(" · ")
            Text(order.drugName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (detail.isNotBlank()) {
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            order.instructions?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            // Last round outcome — "not given (stockout)" is shown as honestly as "given".
            lastAdmin?.let { a ->
                val label = if (a.status == "given") {
                    "Last: given ${timeAgo(a.administeredAt)}"
                } else {
                    "Last: not given (${a.notGivenReason ?: "—"}) ${timeAgo(a.administeredAt)}"
                }
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (a.status == "given") MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.error,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            ) {
                Button(onClick = onGive) { Text("Give") }
                androidx.compose.material3.OutlinedButton(onClick = onNotGiven) { Text("Not given") }
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                TextButton(onClick = onStop) { Text("Stop") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun AddMedicationSheet(
    onDismiss: () -> Unit,
    onAdd: (String, String?, String?, String?, String?) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    var drug by remember { mutableStateOf("") }
    var dose by remember { mutableStateOf("") }
    var route by remember { mutableStateOf("") }
    var freq by remember { mutableStateOf("") }
    var instr by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Add medication", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = drug, onValueChange = { drug = it },
                modifier = Modifier.fillMaxWidth(), label = { Text("Drug") }, singleLine = true,
            )
            Text("Frequency", style = MaterialTheme.typography.labelMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("STAT", "OD", "BD", "TDS", "QDS", "PRN").forEach { chip ->
                    FilterChip(
                        selected = freq.equals(chip, ignoreCase = true),
                        onClick = { freq = chip },
                        label = { Text(chip) },
                    )
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = dose, onValueChange = { dose = it },
                    modifier = Modifier.weight(1f), label = { Text("Dose") }, singleLine = true,
                )
                OutlinedTextField(
                    value = route, onValueChange = { route = it },
                    modifier = Modifier.weight(1f), label = { Text("Route") }, singleLine = true,
                )
                OutlinedTextField(
                    value = freq, onValueChange = { freq = it },
                    modifier = Modifier.weight(1f), label = { Text("Freq") }, singleLine = true,
                )
            }
            OutlinedTextField(
                value = instr, onValueChange = { instr = it },
                modifier = Modifier.fillMaxWidth(), label = { Text("Instructions (optional)") },
            )
            Button(
                onClick = { onAdd(drug, dose.ifBlank { null }, route.ifBlank { null }, freq.ifBlank { null }, instr.ifBlank { null }) },
                enabled = drug.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Add to chart") }
        }
    }
}

@Composable
private fun NotGivenReasonDialog(onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val reasons = listOf("Out of stock", "Refused", "Nil by mouth", "Patient absent", "Other")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Why not given?") },
        text = {
            Column {
                reasons.forEach { r ->
                    TextButton(
                        onClick = { onPick(r) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(r, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun DischargeSheet(
    onDismiss: () -> Unit,
    onDischarge: (String, String?, String?) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    val outcomes = listOf("recovered", "improved", "unchanged", "absconded", "died")
    var outcome by remember { mutableStateOf<String?>(null) }
    var notes by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Discharge", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("Outcome", style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                outcomes.forEach { o ->
                    FilterChip(
                        selected = outcome == o,
                        onClick = { outcome = o },
                        label = { Text(o.replaceFirstChar { it.uppercase() }) },
                    )
                }
            }
            OutlinedTextField(
                value = notes, onValueChange = { notes = it },
                modifier = Modifier.fillMaxWidth(), label = { Text("Notes (optional)") },
            )
            Button(
                onClick = { outcome?.let { onDischarge(it, "home", notes.ifBlank { null }) } },
                enabled = outcome != null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Confirm discharge") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReferOutSheet(
    onDismiss: () -> Unit,
    onRefer: (String, com.karibuhealth.app.domain.model.ReferralUrgency, String, String?) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    var facility by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var transport by remember { mutableStateOf("") }
    var urgency by remember {
        mutableStateOf(com.karibuhealth.app.domain.model.ReferralUrgency.Urgent)
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Refer out", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = facility, onValueChange = { facility = it },
                modifier = Modifier.fillMaxWidth(), label = { Text("Refer to (facility)") }, singleLine = true,
            )
            Text("Urgency", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                com.karibuhealth.app.domain.model.ReferralUrgency.entries.forEach { u ->
                    FilterChip(selected = urgency == u, onClick = { urgency = u }, label = { Text(u.label) })
                }
            }
            OutlinedTextField(
                value = reason, onValueChange = { reason = it },
                modifier = Modifier.fillMaxWidth(), label = { Text("Reason for referral") }, minLines = 2,
            )
            OutlinedTextField(
                value = transport, onValueChange = { transport = it },
                modifier = Modifier.fillMaxWidth(), label = { Text("Transport (optional)") }, singleLine = true,
            )
            Text(
                "The inpatient summary (last obs, medications) is attached automatically.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = { onRefer(facility, urgency, reason, transport.ifBlank { null }) },
                enabled = facility.isNotBlank() && reason.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Create referral") }
        }
    }
}

@Composable
private fun NewbornDangerBanner(findings: List<com.karibuhealth.app.domain.NewbornDangerSigns.Finding>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                "NEWBORN DANGER SIGN",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.error,
            )
            findings.forEach {
                Text("• ${it.label}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
            }
            com.karibuhealth.app.domain.NewbornDangerSigns.CARE_BUNDLE.forEach {
                Text("→ $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
            }
        }
    }
}

@Composable
private fun PostnatalCard(
    rounds: List<com.karibuhealth.app.data.local.db.entity.PostnatalObservationEntity>,
    onRecordMother: () -> Unit,
    onRecordNewborn: () -> Unit,
) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Postnatal", style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.OutlinedButton(onClick = onRecordMother, modifier = Modifier.weight(1f)) { Text("Mother check") }
                androidx.compose.material3.OutlinedButton(onClick = onRecordNewborn, modifier = Modifier.weight(1f)) { Text("Newborn check") }
            }
            rounds.take(4).forEach { o ->
                val who = if (o.subject == "newborn") "Newborn" else "Mother"
                val vitals = listOfNotNull(
                    o.tempC?.let { "T ${it}°C" },
                    o.pulseBpm?.let { "HR $it" },
                    o.respRate?.let { "RR $it" },
                    if (o.bpSystolic != null && o.bpDiastolic != null) "BP ${o.bpSystolic}/${o.bpDiastolic}" else null,
                    o.bleeding?.let { "bleeding: $it" },
                ).joinToString(" · ")
                Text("$who · ${timeAgo(o.observedAt)}${if (vitals.isNotBlank()) " — $vitals" else ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun PostnatalSheet(
    subject: String,
    onDismiss: () -> Unit,
    onSave: (Double?, Int?, Int?, Int?, Int?, String?, Boolean?, Boolean?, Boolean, Boolean, Boolean, String?) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    val isNewborn = subject == "newborn"
    var temp by remember { mutableStateOf("") }
    var pulse by remember { mutableStateOf("") }
    var rr by remember { mutableStateOf("") }
    var sys by remember { mutableStateOf("") }
    var dia by remember { mutableStateOf("") }
    var bleeding by remember { mutableStateOf<String?>(null) }
    var fundusFirm by remember { mutableStateOf(false) }
    var feedingWell by remember { mutableStateOf(false) }
    var notFeeding by remember { mutableStateOf(false) }
    var convulsions by remember { mutableStateOf(false) }
    var jaundice by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(if (isNewborn) "Newborn check" else "Mother postnatal check", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumField(temp, { temp = it }, "Temp °C", Modifier.weight(1f), decimal = true)
                if (isNewborn) NumField(rr, { rr = it }, "Resp", Modifier.weight(1f))
                else NumField(pulse, { pulse = it }, "Pulse", Modifier.weight(1f))
            }
            if (!isNewborn) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    NumField(sys, { sys = it }, "BP sys", Modifier.weight(1f))
                    NumField(dia, { dia = it }, "BP dia", Modifier.weight(1f))
                }
                Text("Lochia / bleeding", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("normal" to "Normal", "heavy" to "Heavy").forEach { (v, l) ->
                        FilterChip(selected = bleeding == v, onClick = { bleeding = v }, label = { Text(l) })
                    }
                }
                CheckRow("Uterus / fundus firm", fundusFirm) { fundusFirm = it }
            } else {
                CheckRow("Feeding well", feedingWell) { feedingWell = it }
                CheckRow("Not feeding", notFeeding) { notFeeding = it }
                CheckRow("Convulsions", convulsions) { convulsions = it }
                CheckRow("Jaundice", jaundice) { jaundice = it }
            }
            OutlinedTextField(value = note, onValueChange = { note = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Note (optional)") })
            Button(
                onClick = {
                    onSave(
                        temp.toDoubleOrNull(),
                        if (isNewborn) null else pulse.toIntOrNull(),
                        if (isNewborn) rr.toIntOrNull() else null,
                        sys.toIntOrNull(), dia.toIntOrNull(),
                        bleeding, if (isNewborn) null else fundusFirm,
                        if (isNewborn) feedingWell else null,
                        notFeeding, convulsions, jaundice, note.ifBlank { null },
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save") }
        }
    }
}

@Composable
private fun MaternalAlertBanner(alert: com.karibuhealth.app.domain.MaternalDangerSigns.Alert) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                alert.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.error,
            )
            alert.steps.forEachIndexed { i, step ->
                Text(
                    "${i + 1}. $step",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
        }
    }
}

@Composable
private fun DeliverySummaryCard(
    delivery: com.karibuhealth.app.data.local.db.entity.DeliveryEntity?,
    onRecord: () -> Unit,
) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            ) {
                Text("Delivery", style = MaterialTheme.typography.labelLarge)
                TextButton(onClick = onRecord) { Text(if (delivery == null) "Record" else "Edit") }
            }
            if (delivery == null) {
                Text(
                    "No delivery recorded.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                val line = listOfNotNull(
                    delivery.mode,
                    delivery.outcome,
                    delivery.babySex,
                    delivery.birthWeightG?.let { "${it} g" },
                    if (delivery.apgar1 != null || delivery.apgar5 != null) "APGAR ${delivery.apgar1 ?: "—"}/${delivery.apgar5 ?: "—"}" else null,
                    delivery.bloodLossMl?.let { "EBL ${it} ml" },
                ).joinToString(" · ")
                if (line.isNotBlank()) Text(line, style = MaterialTheme.typography.bodyMedium)
                val flags = listOfNotNull(
                    if (delivery.oxytocinGiven) "oxytocin" else null,
                    if (delivery.resuscitationDone) "resuscitated" else null,
                    if (delivery.vitaminKGiven) "vit K" else null,
                    if (delivery.earlyBreastfeeding) "early BF" else null,
                ).joinToString(", ")
                if (flags.isNotBlank()) {
                    Text(flags, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun DeliverySheet(
    existing: com.karibuhealth.app.data.local.db.entity.DeliveryEntity?,
    onDismiss: () -> Unit,
    onSave: (String?, String?, String?, Int?, Int?, Int?, Boolean, Int?, Boolean?, Boolean, Boolean, Boolean, String?) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    var mode by remember { mutableStateOf(existing?.mode) }
    var outcome by remember { mutableStateOf(existing?.outcome) }
    var sex by remember { mutableStateOf(existing?.babySex) }
    var weight by remember { mutableStateOf(existing?.birthWeightG?.toString() ?: "") }
    var ap1 by remember { mutableStateOf(existing?.apgar1?.toString() ?: "") }
    var ap5 by remember { mutableStateOf(existing?.apgar5?.toString() ?: "") }
    var loss by remember { mutableStateOf(existing?.bloodLossMl?.toString() ?: "") }
    var oxytocin by remember { mutableStateOf(existing?.oxytocinGiven ?: false) }
    var placenta by remember { mutableStateOf(existing?.placentaComplete ?: false) }
    var resus by remember { mutableStateOf(existing?.resuscitationDone ?: false) }
    var vitK by remember { mutableStateOf(existing?.vitaminKGiven ?: false) }
    var breastfeeding by remember { mutableStateOf(existing?.earlyBreastfeeding ?: false) }
    var notes by remember { mutableStateOf(existing?.notes ?: "") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Delivery record", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)

            Text("Mode", style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("svd" to "SVD", "assisted" to "Assisted", "breech" to "Breech", "referred_for_cs" to "Referred (CS)").forEach { (v, l) ->
                    FilterChip(selected = mode == v, onClick = { mode = v }, label = { Text(l) })
                }
            }
            Text("Outcome", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("live" to "Live birth", "stillbirth" to "Stillbirth").forEach { (v, l) ->
                    FilterChip(selected = outcome == v, onClick = { outcome = v }, label = { Text(l) })
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Female" to "F", "Male" to "M").forEach { (v, l) ->
                    FilterChip(selected = sex == v, onClick = { sex = v }, label = { Text("Baby $l") })
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumField(weight, { weight = it }, "Birth wt (g)", Modifier.weight(1f))
                NumField(ap1, { ap1 = it }, "APGAR 1", Modifier.weight(1f))
                NumField(ap5, { ap5 = it }, "APGAR 5", Modifier.weight(1f))
            }

            CheckRow("Oxytocin given (3rd stage)", oxytocin) { oxytocin = it }
            NumField(loss, { loss = it }, "Blood loss (ml)", Modifier.fillMaxWidth())
            CheckRow("Placenta complete", placenta) { placenta = it }
            CheckRow("Newborn needed resuscitation", resus) { resus = it }

            if (resus) {
                // Helping Babies Breathe — the golden-minute prompt.
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            com.karibuhealth.app.domain.MaternalDangerSigns.HELPING_BABIES_BREATHE.title,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.error,
                        )
                        com.karibuhealth.app.domain.MaternalDangerSigns.HELPING_BABIES_BREATHE.steps.forEachIndexed { i, step ->
                            Text("${i + 1}. $step", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                        }
                    }
                }
            }

            CheckRow("Vitamin K given", vitK) { vitK = it }
            CheckRow("Early breastfeeding", breastfeeding) { breastfeeding = it }
            OutlinedTextField(value = notes, onValueChange = { notes = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Notes (optional)") })

            Button(
                onClick = {
                    onSave(
                        mode, outcome, sex, weight.toIntOrNull(), ap1.toIntOrNull(), ap5.toIntOrNull(),
                        oxytocin, loss.toIntOrNull(), placenta, resus, vitK, breastfeeding, notes.ifBlank { null },
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save delivery") }
        }
    }
}

@Composable
private fun ProgressNoteRow(note: com.karibuhealth.app.data.local.db.entity.AdmissionNoteEntity) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val by = note.authorName?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""
            Text(
                timeAgo(note.createdAt) + by,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(note.note, style = MaterialTheme.typography.bodyMedium)
            if (!note.isSynced) {
                Text(
                    "Saved on device",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddNoteSheet(
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    var text by remember { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Progress note", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Note") },
                minLines = 3,
            )
            Button(
                onClick = { onSave(text) },
                enabled = text.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save note") }
        }
    }
}

@Composable
private fun DangerSignBanner(findings: List<InpatientDangerSigns.Finding>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = "DANGER SIGN",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.error,
            )
            findings.forEach { f ->
                Text(
                    "• ${f.label}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
            Text(
                text = InpatientDangerSigns.ACTION,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun RecordObservationSheet(
    onDismiss: () -> Unit,
    onSave: (ObservationInput) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    var temp by remember { mutableStateOf("") }
    var pulse by remember { mutableStateOf("") }
    var resp by remember { mutableStateOf("") }
    var sys by remember { mutableStateOf("") }
    var dia by remember { mutableStateOf("") }
    var spo2 by remember { mutableStateOf("") }
    var avpu by remember { mutableStateOf<String?>(null) }
    var notFeeding by remember { mutableStateOf(false) }
    var vomiting by remember { mutableStateOf(false) }
    var convulsions by remember { mutableStateOf(false) }
    var lethargic by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Record observation", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumField(temp, { temp = it }, "Temp °C", Modifier.weight(1f), decimal = true)
                NumField(pulse, { pulse = it }, "Pulse", Modifier.weight(1f))
                NumField(resp, { resp = it }, "Resp", Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumField(sys, { sys = it }, "BP sys", Modifier.weight(1f))
                NumField(dia, { dia = it }, "BP dia", Modifier.weight(1f))
                NumField(spo2, { spo2 = it }, "SpO₂ (opt)", Modifier.weight(1f))
            }

            Text("Consciousness (AVPU)", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("A", "V", "P", "U").forEach { v ->
                    FilterChip(selected = avpu == v, onClick = { avpu = if (avpu == v) null else v }, label = { Text(v) })
                }
            }

            Text("Danger signs (under 5)", style = MaterialTheme.typography.labelLarge)
            CheckRow("Not feeding / drinking", notFeeding) { notFeeding = it }
            CheckRow("Vomiting everything", vomiting) { vomiting = it }
            CheckRow("Convulsions", convulsions) { convulsions = it }
            CheckRow("Lethargic / unconscious", lethargic) { lethargic = it }

            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Note (optional)") },
            )

            Button(
                onClick = {
                    onSave(
                        ObservationInput(
                            tempC = temp.toDoubleOrNull(),
                            pulseBpm = pulse.toIntOrNull(),
                            respRate = resp.toIntOrNull(),
                            bpSystolic = sys.toIntOrNull(),
                            bpDiastolic = dia.toIntOrNull(),
                            spo2Pct = spo2.toIntOrNull(),
                            avpu = avpu,
                            imciNotFeeding = notFeeding,
                            imciVomitingEverything = vomiting,
                            imciConvulsions = convulsions,
                            imciLethargicUnconscious = lethargic,
                            note = note.ifBlank { null },
                        ),
                    )
                    // Sheet stays open until the VM confirms the save (savedTick),
                    // so a validation prompt or error doesn't lose the entered round.
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save round") }
        }
    }
}

@Composable
private fun NumField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    decimal: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { v -> onChange(v.filter { it.isDigit() || (decimal && it == '.') }) },
        modifier = modifier,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number,
        ),
    )
}

@Composable
private fun CheckRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ObservationRow(obs: AdmissionObservationEntity) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(timeAgo(obs.observedAt), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium)
            val vitals = listOfNotNull(
                obs.tempC?.let { "T ${it}°C" },
                obs.pulseBpm?.let { "HR $it" },
                obs.respRate?.let { "RR $it" },
                if (obs.bpSystolic != null && obs.bpDiastolic != null) "BP ${obs.bpSystolic}/${obs.bpDiastolic}" else null,
                obs.spo2Pct?.let { "SpO₂ $it%" },
                obs.avpu?.let { "AVPU $it" },
            ).joinToString(" · ")
            if (vitals.isNotBlank()) Text(vitals, style = MaterialTheme.typography.bodyMedium)
            val dangers = listOfNotNull(
                if (obs.imciNotFeeding) "Not feeding" else null,
                if (obs.imciVomitingEverything) "Vomiting everything" else null,
                if (obs.imciConvulsions) "Convulsions" else null,
                if (obs.imciLethargicUnconscious) "Lethargic/unconscious" else null,
            )
            if (dangers.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    dangers.forEach { AssistChip(onClick = {}, label = { Text(it) }) }
                }
            }
            obs.note?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun timeAgo(iso: String): String = try {
    val mins = Duration.between(Instant.parse(iso), Instant.now()).toMinutes()
    when {
        mins < 1 -> "Just now"
        mins < 60 -> "$mins min ago"
        mins < 1440 -> "${mins / 60} h ago"
        else -> "${mins / 1440} d ago"
    }
} catch (_: Exception) {
    iso
}
