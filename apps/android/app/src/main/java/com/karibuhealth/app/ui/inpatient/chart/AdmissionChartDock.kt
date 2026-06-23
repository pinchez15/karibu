package com.karibuhealth.app.ui.inpatient.chart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.data.local.db.entity.AdmissionObservationEntity
import com.karibuhealth.app.data.local.db.entity.IvInfusionEntity
import com.karibuhealth.app.domain.InpatientDoseSchedule
import com.karibuhealth.app.domain.InpatientIvCatalog

@Composable
fun ClinicalDock(
    latestObs: AdmissionObservationEntity?,
    doseSchedule: InpatientDoseSchedule.ScheduleResult,
    ivInfusions: List<IvInfusionEntity>,
    isSaving: Boolean,
    onQuickVitals: (temp: Double?, pulse: Int?, resp: Int?, sys: Int?, dia: Int?) -> Unit,
    onGiveDose: (orderId: String, scheduledFor: String) -> Unit,
    onSkipDose: (orderId: String, scheduledFor: String) -> Unit,
    onStartIv: (
        fluidType: String,
        volumeMl: Int,
        additive: String?,
        rateMlHr: Int?,
        dropsPerMin: Int?,
        site: String?,
        notes: String?,
    ) -> Unit,
    onIvCheck: (infusionId: String, dripRunning: Boolean, siteOk: Boolean) -> Unit,
    onStopIv: (infusionId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QuickVitalsBar(latestObs = latestObs, isSaving = isSaving, onSave = onQuickVitals)
        DueNowPanel(
            schedule = doseSchedule,
            onGive = onGiveDose,
            onSkip = onSkipDose,
        )
        IvDripPanel(
            infusions = ivInfusions,
            onStart = onStartIv,
            onCheck = onIvCheck,
            onStop = onStopIv,
        )
    }
}

@Composable
fun QuickVitalsBar(
    latestObs: AdmissionObservationEntity?,
    isSaving: Boolean,
    onSave: (temp: Double?, pulse: Int?, resp: Int?, sys: Int?, dia: Int?) -> Unit,
) {
    var temp by remember { mutableStateOf("") }
    var pulse by remember { mutableStateOf("") }
    var resp by remember { mutableStateOf("") }
    var sys by remember { mutableStateOf("") }
    var dia by remember { mutableStateOf("") }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Vitals", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                latestObs?.let { o ->
                    val summary = listOfNotNull(
                        o.tempC?.let { "T $it" },
                        o.pulseBpm?.let { "HR $it" },
                        if (o.bpSystolic != null && o.bpDiastolic != null) "BP ${o.bpSystolic}/${o.bpDiastolic}" else null,
                    ).joinToString(" · ")
                    if (summary.isNotBlank()) {
                        Text(summary, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                VitalsField("T°C", temp, { temp = it }, Modifier.weight(1f))
                VitalsField("HR", pulse, { pulse = it }, Modifier.weight(1f))
                VitalsField("RR", resp, { resp = it }, Modifier.weight(1f))
                VitalsField("Sys", sys, { sys = it }, Modifier.weight(1f))
                VitalsField("Dia", dia, { dia = it }, Modifier.weight(1f))
            }
            Button(
                onClick = {
                    onSave(
                        temp.toDoubleOrNull(),
                        pulse.toIntOrNull(),
                        resp.toIntOrNull(),
                        sys.toIntOrNull(),
                        dia.toIntOrNull(),
                    )
                    temp = ""; pulse = ""; resp = ""; sys = ""; dia = ""
                },
                enabled = !isSaving && listOf(temp, pulse, resp, sys, dia).any { it.isNotBlank() },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (isSaving) "Saving…" else "Save vitals")
            }
        }
    }
}

@Composable
private fun VitalsField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = modifier,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DueNowPanel(
    schedule: InpatientDoseSchedule.ScheduleResult,
    onGive: (orderId: String, scheduledFor: String) -> Unit,
    onSkip: (orderId: String, scheduledFor: String) -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Due now", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            if (schedule.dueNow.isEmpty() && schedule.prnOrders.isEmpty()) {
                Text(
                    "No doses due.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                schedule.dueNow.forEach { slot ->
                    val overdue = slot.status == InpatientDoseSchedule.SlotStatus.OVERDUE
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "${slot.label} ${slot.drugName}${slot.dose?.let { " $it" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = { onGive(slot.orderId, slot.scheduledFor.toString()) }) {
                            Text("Give")
                        }
                        TextButton(onClick = { onSkip(slot.orderId, slot.scheduledFor.toString()) }) {
                            Text("Skip")
                        }
                    }
                }
                schedule.prnOrders.forEach { order ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("PRN ${order.drugName}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        TextButton(onClick = { onGive(order.id, "") }) { Text("Give") }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun IvDripPanel(
    infusions: List<IvInfusionEntity>,
    onStart: (
        fluidType: String,
        volumeMl: Int,
        additive: String?,
        rateMlHr: Int?,
        dropsPerMin: Int?,
        site: String?,
        notes: String?,
    ) -> Unit,
    onCheck: (infusionId: String, dripRunning: Boolean, siteOk: Boolean) -> Unit,
    onStop: (infusionId: String) -> Unit,
) {
    var showStart by remember { mutableStateOf(false) }
    var fluid by remember { mutableStateOf(InpatientIvCatalog.fluids.first().id) }
    var additive by remember { mutableStateOf("none") }
    var volume by remember { mutableStateOf(1000) }
    var rate by remember { mutableStateOf("") }
    var site by remember { mutableStateOf("") }

    val active = infusions.filter { it.active }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("IV drips", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                TextButton(onClick = { showStart = !showStart }) {
                    Text(if (showStart) "Cancel" else "+ Start drip")
                }
            }

            if (showStart) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    InpatientIvCatalog.fluids.forEach { f ->
                        FilterChip(
                            selected = fluid == f.id,
                            onClick = { fluid = f.id },
                            label = { Text(f.label, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    InpatientIvCatalog.volumePresetsMl.forEach { v ->
                        FilterChip(
                            selected = volume == v,
                            onClick = { volume = v },
                            label = { Text("${v}ml", style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
                OutlinedTextField(
                    value = rate,
                    onValueChange = { rate = it },
                    label = { Text("Rate ml/hr") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = site,
                    onValueChange = { site = it },
                    label = { Text("Site (e.g. dorsum hand)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        onStart(fluid, volume, additive, rate.toIntOrNull(), null, site.ifBlank { null }, null)
                        showStart = false
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Start infusion") }
            }

            if (active.isEmpty() && !showStart) {
                Text(
                    "No active drips.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                active.forEach { iv ->
                    val mlLeft = InpatientIvCatalog.estimateMlRemaining(iv.volumeMl, iv.rateMlHr, iv.startedAt)
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            "${InpatientIvCatalog.fluidLabel(iv.fluidType)} ${iv.volumeMl}ml" +
                                (mlLeft?.let { " · ~${it}ml left" } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { onCheck(iv.id, true, true) }) { Text("OK") }
                            TextButton(onClick = { onCheck(iv.id, false, true) }) { Text("Issue") }
                            TextButton(onClick = { onStop(iv.id) }) { Text("Stop") }
                        }
                    }
                }
            }
        }
    }
}
