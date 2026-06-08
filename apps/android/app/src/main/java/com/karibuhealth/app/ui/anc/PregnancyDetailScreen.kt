package com.karibuhealth.app.ui.anc

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.data.local.db.entity.AncContactEntity
import com.karibuhealth.app.domain.AncProtocol

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PregnancyDetailScreen(
    onNavigateBack: () -> Unit,
    viewModel: PregnancyDetailViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    var showRecord by remember { mutableStateOf(false) }
    LaunchedEffect(s.savedTick) { if (s.savedTick > 0) showRecord = false }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(s.pregnancy?.patientName ?: "Pregnancy") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            s.pregnancy?.let { pg ->
                item(key = "header") {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            val meta = listOfNotNull(
                                s.status?.gestationWeeks?.let { "${it} weeks" },
                                pg.edd?.take(10)?.let { "EDD $it" },
                                if (pg.gravida != null || pg.para != null) "G${pg.gravida ?: "?"}P${pg.para ?: "?"}" else null,
                                pg.hivStatus?.let { "HIV $it" },
                            ).joinToString(" · ")
                            Text(meta, fontWeight = FontWeight.Medium)
                            pg.riskNotes?.takeIf { it.isNotBlank() }?.let {
                                Text("Risk: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                            }
                            if (!pg.isSynced) {
                                Text("Saved on device — will sync when online.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            // Protocol tracker.
            s.status?.let { st ->
                item(key = "tracker") {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.padding(14.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Protocol status", style = MaterialTheme.typography.labelLarge)
                            Text("ANC contacts: ${st.contactsDone} done / ${st.contactsDue} due (target 8)", style = MaterialTheme.typography.bodyMedium)
                            Text("IPTp-SP: ${st.iptpDone} / ${AncProtocol.IPTP_TARGET}", style = MaterialTheme.typography.bodyMedium)
                            if (st.gaps.isNotEmpty()) {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    st.gaps.forEach { AssistChip(onClick = {}, label = { Text(it) }) }
                                }
                            } else {
                                Text("Up to date", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            item(key = "record") {
                Button(onClick = { showRecord = true }, modifier = Modifier.fillMaxWidth()) { Text("Record ANC contact") }
            }
            item(key = "contacts-header") { Text("Contacts", style = MaterialTheme.typography.labelLarge) }
            if (s.contacts.isEmpty()) {
                item(key = "contacts-empty") {
                    Text("No contacts recorded yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                items(s.contacts, key = { it.id }) { c -> ContactRow(c) }
            }
        }
    }

    if (showRecord) {
        RecordContactSheet(
            onDismiss = { showRecord = false },
            onSave = { viewModel.recordContact(it) },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        )
    }
}

@Composable
private fun ContactRow(c: AncContactEntity) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                listOfNotNull(c.contactNumber?.let { "Contact $it" }, c.gestationWeeks?.let { "${it}wk" }, c.contactDate.take(10)).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium,
            )
            val vitals = listOfNotNull(
                if (c.bpSystolic != null && c.bpDiastolic != null) "BP ${c.bpSystolic}/${c.bpDiastolic}" else null,
                c.weightKg?.let { "Wt ${it}kg" },
                c.fundalHeightCm?.let { "FH ${it}cm" },
                c.fetalHeartRate?.let { "FHR $it" },
                c.urineProtein?.let { "urine $it" },
                c.hb?.let { "Hb $it" },
            ).joinToString(" · ")
            if (vitals.isNotBlank()) Text(vitals, style = MaterialTheme.typography.bodySmall)
            val given = listOfNotNull(
                if (c.iptpGiven) "IPTp" else null,
                if (c.ifasGiven) "IFAS" else null,
                if (c.tdGiven) "Td" else null,
                if (c.dewormed) "dewormed" else null,
                if (c.itnGiven) "ITN" else null,
            ).joinToString(", ")
            if (given.isNotBlank()) Text("Given: $given", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecordContactSheet(
    onDismiss: () -> Unit,
    onSave: (AncContactInput) -> Unit,
    sheetState: androidx.compose.material3.SheetState,
) {
    var sys by remember { mutableStateOf("") }
    var dia by remember { mutableStateOf("") }
    var weight by remember { mutableStateOf("") }
    var fh by remember { mutableStateOf("") }
    var fhr by remember { mutableStateOf("") }
    var urine by remember { mutableStateOf<String?>(null) }
    var hb by remember { mutableStateOf("") }
    var iptp by remember { mutableStateOf(false) }
    var ifas by remember { mutableStateOf(false) }
    var td by remember { mutableStateOf(false) }
    var dewormed by remember { mutableStateOf(false) }
    var itn by remember { mutableStateOf(false) }
    var notes by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 24.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("ANC contact", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumField(sys, { sys = it }, "BP sys", Modifier.weight(1f))
                NumField(dia, { dia = it }, "BP dia", Modifier.weight(1f))
                NumField(weight, { weight = it }, "Weight", Modifier.weight(1f), decimal = true)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumField(fh, { fh = it }, "Fundal ht", Modifier.weight(1f))
                NumField(fhr, { fhr = it }, "FHR", Modifier.weight(1f))
                NumField(hb, { hb = it }, "Hb", Modifier.weight(1f), decimal = true)
            }
            Text("Urine protein", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("neg" to "Neg", "+" to "+", "++" to "++", "+++" to "+++").forEach { (v, l) ->
                    FilterChip(selected = urine == v, onClick = { urine = if (urine == v) null else v }, label = { Text(l) })
                }
            }
            Text("Given this contact", style = MaterialTheme.typography.labelLarge)
            CheckRow("IPTp-SP", iptp) { iptp = it }
            CheckRow("Iron + folate (IFAS)", ifas) { ifas = it }
            CheckRow("Td (tetanus)", td) { td = it }
            CheckRow("Deworming", dewormed) { dewormed = it }
            CheckRow("ITN issued", itn) { itn = it }
            OutlinedTextField(value = notes, onValueChange = { notes = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Notes (optional)") })
            Button(
                onClick = {
                    onSave(
                        AncContactInput(
                            bpSystolic = sys.toIntOrNull(), bpDiastolic = dia.toIntOrNull(), weightKg = weight.toDoubleOrNull(),
                            fundalHeightCm = fh.toIntOrNull(), fetalHeartRate = fhr.toIntOrNull(), urineProtein = urine,
                            hb = hb.toDoubleOrNull(), iptpGiven = iptp, ifasGiven = ifas, tdGiven = td,
                            dewormed = dewormed, itnGiven = itn, notes = notes.ifBlank { null },
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save contact") }
        }
    }
}

@Composable
private fun CheckRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}
