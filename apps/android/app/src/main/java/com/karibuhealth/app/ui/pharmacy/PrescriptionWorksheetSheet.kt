package com.karibuhealth.app.ui.pharmacy

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import com.karibuhealth.app.domain.model.PrescriptionOrderLine

data class DispenseLineDraft(
    val prescriptionOrderId: String,
    val displayName: String,
    val medicationCode: String? = null,
    val sig: String,
    val quantityDispensed: String,
    val quantityUnit: String,
    val lineStatus: String,
    val notes: String,
)

private fun Double.asQtyString(): String =
    if (this % 1.0 == 0.0) toInt().toString() else toString()

fun defaultDraft(line: PrescriptionOrderLine): DispenseLineDraft {
    // PHARM-5 (R2) remainder unblock. `quantity_dispensed_so_far` now rides the
    // prescription-orders pull (prescription_orders_with_dispensed view), so a
    // `partially_dispensed` line can be finished on the tablet: default Qty to the
    // REMAINING balance (quantityPrescribed − quantityDispensedSoFar, clamped ≥ 0),
    // never above remaining — so we can't enqueue an over-dispense the server's
    // `>=`-safe guard would reject. A fresh line defaults to the full prescribed
    // amount (remaining == prescribed when nothing has been dispensed yet). Lines
    // with an unknown prescribed quantity (legacy_text) pre-fill nothing and the
    // operator enters the amount manually.
    val remaining = line.remainingToDispense()
    return DispenseLineDraft(
        prescriptionOrderId = line.id,
        displayName = line.displayName(),
        medicationCode = line.medicationCode,
        sig = line.sigSummary(),
        quantityDispensed = remaining?.asQtyString().orEmpty(),
        quantityUnit = (line.dispenseUnit ?: line.quantityUnit).orEmpty(),
        lineStatus = "dispensed",
        notes = "",
    )
}

private val LINE_STATUS_OPTIONS = listOf(
    "dispensed" to "Dispensed",
    "partially_dispensed" to "Partial",
    "out_of_stock" to "Out of stock",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrescriptionWorksheetSheet(
    item: NeedsPharmacyItem,
    busy: Boolean,
    onDismiss: () -> Unit,
    onStart: () -> Unit,
    onComplete: (lines: List<DispenseLineDraft>, visitNotes: String) -> Unit,
    onSendBack: (reason: String) -> Unit,
    onSendLineBack: (prescriptionOrderId: String, reason: String) -> Unit = { _, _ -> },
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val lines = item.prescriptionLines
    var drafts by remember(item.visitId, lines) {
        mutableStateOf(lines.map(::defaultDraft))
    }
    var visitNotes by remember(item.visitId) { mutableStateOf("") }
    var sendBackReason by remember { mutableStateOf("") }
    var sendBackLineId by remember { mutableStateOf<String?>(null) }
    var showSendBack by remember { mutableStateOf(false) }
    // PHARM-5 (R2): partials are no longer blocked — any line (incl. a partial's
    // remaining balance) can be handed over, so completion is possible whenever
    // there are lines to dispense.
    val canComplete = drafts.isNotEmpty()
    val started = item.dispensingStatus != "not_started"

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(
                text = item.patientName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            if (!started) {
                Spacer(Modifier.height(8.dp))
                Button(onClick = onStart, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    Text("Start dispensing")
                }
            }
            if (lines.isEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text(
                    "No structured prescription lines yet. Pull to refresh when online.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    modifier = Modifier.heightIn(max = 420.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(drafts, key = { _, d -> d.prescriptionOrderId }) { index, draft ->
                        val sourceLine = lines.getOrNull(index)
                        val canSendLineBack = sourceLine?.status in listOf(
                            "ordered", "dispensing", "partially_dispensed", "out_of_stock",
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(draft.displayName, fontWeight = FontWeight.SemiBold)
                            if (draft.sig.isNotBlank()) {
                                Text(draft.sig, style = MaterialTheme.typography.bodySmall)
                            }
                            if (sourceLine?.status == "partially_dispensed") {
                                // PHARM-5 (R2): a partial now defaults Qty to the remaining
                                // balance owed; dispensing it auto-completes the line server-side.
                                val remaining = sourceLine.remainingToDispense()
                                Text(
                                    if (remaining != null) {
                                        "Partly dispensed — ${remaining.asQtyString()} " +
                                            "${draft.quantityUnit.ifBlank { "unit" }} remaining."
                                    } else {
                                        "Partly dispensed — enter the remaining amount to hand over."
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                LINE_STATUS_OPTIONS.forEach { (value, label) ->
                                    FilterChip(
                                        selected = draft.lineStatus == value,
                                        onClick = {
                                            drafts = drafts.toMutableList().also {
                                                it[index] = draft.copy(lineStatus = value)
                                            }
                                        },
                                        label = { Text(label) },
                                    )
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = draft.quantityDispensed,
                                    onValueChange = { v ->
                                        drafts = drafts.toMutableList().also {
                                            it[index] = draft.copy(quantityDispensed = v)
                                        }
                                    },
                                    label = { Text("Qty") },
                                    modifier = Modifier.weight(1f),
                                    singleLine = true,
                                )
                                OutlinedTextField(
                                    value = draft.quantityUnit,
                                    onValueChange = { v ->
                                        drafts = drafts.toMutableList().also {
                                            it[index] = draft.copy(quantityUnit = v)
                                        }
                                    },
                                    label = { Text("Unit") },
                                    modifier = Modifier.weight(1f),
                                    singleLine = true,
                                )
                            }
                            OutlinedTextField(
                                value = draft.notes,
                                onValueChange = { v ->
                                    drafts = drafts.toMutableList().also {
                                        it[index] = draft.copy(notes = v)
                                    }
                                },
                                label = { Text("Line notes") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (canSendLineBack && sendBackLineId != draft.prescriptionOrderId) {
                                TextButton(
                                    onClick = {
                                        sendBackLineId = draft.prescriptionOrderId
                                        sendBackReason = ""
                                        showSendBack = true
                                    },
                                    enabled = !busy,
                                ) { Text("Send line to clinician") }
                            }
                        }
                    }
                }
            }
            OutlinedTextField(
                value = visitNotes,
                onValueChange = { visitNotes = it },
                label = { Text("Visit notes (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )
            if (showSendBack) {
                OutlinedTextField(
                    value = sendBackReason,
                    onValueChange = { sendBackReason = it },
                    label = {
                        Text(
                            if (sendBackLineId != null) "Reason for line send-back"
                            else "Reason for clinician",
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { showSendBack = false; sendBackLineId = null }) { Text("Cancel") }
                    Button(
                        onClick = {
                            val lineId = sendBackLineId
                            if (lineId != null) {
                                onSendLineBack(lineId, sendBackReason.trim())
                            } else {
                                onSendBack(sendBackReason.trim())
                            }
                            showSendBack = false
                            sendBackLineId = null
                        },
                        enabled = sendBackReason.isNotBlank() && !busy,
                    ) { Text("Send back") }
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    TextButton(onClick = { showSendBack = true }, enabled = !busy) {
                        Text("Send back")
                    }
                    Button(
                        // PHARM-5 (R2): partials are unblocked — every draft (including a
                        // partial's remaining balance, defaulted from quantity_dispensed_so_far)
                        // is submitted. A full remaining dispense auto-completes the line
                        // server-side; the Qty default never exceeds remaining, so the
                        // `>=`-safe over-dispense guard can't reject it.
                        onClick = {
                            onComplete(drafts, visitNotes.trim())
                        },
                        enabled = canComplete && !busy,
                    ) { Text("Hand over & complete") }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
