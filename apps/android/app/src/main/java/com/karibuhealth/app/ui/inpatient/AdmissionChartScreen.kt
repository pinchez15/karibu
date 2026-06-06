package com.karibuhealth.app.ui.inpatient

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdmissionChartScreen(
    onNavigateBack: () -> Unit,
    viewModel: AdmissionChartViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    var showSheet by remember { mutableStateOf(false) }

    // Close the record sheet only once a round actually saves.
    androidx.compose.runtime.LaunchedEffect(s.savedTick) {
        if (s.savedTick > 0) showSheet = false
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
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            s.admission?.let { a ->
                OutlinedCard(Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        val meta = listOfNotNull(
                            if (a.ward == "maternity") "Maternity" else "General",
                            a.bedLabel?.let { "Bed $it" },
                            a.weightKg?.let { "${it} kg" },
                        ).joinToString(" · ")
                        Text(meta, fontWeight = FontWeight.Medium)
                        a.chiefComplaint?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
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

            Button(
                onClick = { showSheet = true },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            ) { Text("Record observation") }

            Text(
                "Rounds",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp),
            )
            if (s.observations.isEmpty()) {
                Text(
                    "No observations yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            } else {
                LazyColumn(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(s.observations, key = { it.id }) { obs -> ObservationRow(obs) }
                }
            }
        }
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
private fun DangerSignBanner(findings: List<InpatientDangerSigns.Finding>) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
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
