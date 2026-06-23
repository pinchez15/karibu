package com.karibuhealth.app.ui.lab

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.LabQueue
import com.karibuhealth.app.domain.model.LabTestResultRow
import com.karibuhealth.app.domain.model.NeedsLabItem
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusKind
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.theme.Cobalt

@Composable
fun LabQueueList(
    items: List<NeedsLabItem>,
    busyKey: String?,
    onStartTest: (visitId: String, testName: String) -> Unit,
    onRecordTest: (visitId: String, testName: String, result: String, abnormal: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(items, key = { it.visitId }) { visit ->
            PatientLabGroup(
                visit = visit,
                busyKey = busyKey,
                onStartTest = onStartTest,
                onRecordTest = onRecordTest,
            )
        }
    }
}

@Composable
private fun PatientLabGroup(
    visit: NeedsLabItem,
    busyKey: String?,
    onStartTest: (visitId: String, testName: String) -> Unit,
    onRecordTest: (visitId: String, testName: String, result: String, abnormal: Boolean) -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(visit.patientName, fontWeight = FontWeight.SemiBold)
            KhMetaText(
                listOfNotNull(
                    visit.sex,
                    visit.derivedAge?.let { "${it}y" },
                    visit.chiefComplaint,
                ).joinToString(" · "),
            )
            visit.diagnosis?.takeIf { it.isNotBlank() }?.let {
                Text("Suspected: $it", style = MaterialTheme.typography.bodySmall)
            }
            visit.tests.forEach { test ->
                LabTestRow(
                    visitId = visit.visitId,
                    test = test,
                    busy = busyKey == "${visit.visitId}:${test.test}",
                    onStart = { onStartTest(visit.visitId, test.test) },
                    onRecord = { result, abnormal -> onRecordTest(visit.visitId, test.test, result, abnormal) },
                )
            }
        }
    }
}

@Composable
private fun LabTestRow(
    visitId: String,
    test: LabTestResultRow,
    busy: Boolean,
    onStart: () -> Unit,
    onRecord: (result: String, abnormal: Boolean) -> Unit,
) {
    var result by remember(visitId, test.test) { mutableStateOf(test.result.orEmpty()) }
    val supportsPosNeg = LabQueue.labTestSupportsPosNeg(test.test)

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(test.test, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            KhStatusPill(
                kind = when (test.status) {
                    "abnormal" -> KhStatusKind.Urgent
                    "done" -> KhStatusKind.Done
                    "running" -> KhStatusKind.Lab
                    else -> KhStatusKind.Waiting
                },
                label = test.status.replaceFirstChar { it.uppercase() },
            )
        }
        OutlinedTextField(
            value = result,
            onValueChange = { result = it },
            label = { Text("Result") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            if (test.status == "pending") {
                Button(
                    onClick = onStart,
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                ) { Text("Start") }
            }
            if (supportsPosNeg) {
                OutlinedButton(onClick = { onRecord("Positive", true) }, enabled = !busy) {
                    Text("Positive")
                }
                OutlinedButton(onClick = { onRecord("Negative", false) }, enabled = !busy) {
                    Text("Negative")
                }
            }
            OutlinedButton(onClick = { onRecord(result, true) }, enabled = !busy && result.isNotBlank()) {
                Text("Abnormal")
            }
            if (!supportsPosNeg) {
                Button(onClick = { onRecord(result, false) }, enabled = !busy && result.isNotBlank()) {
                    Text("Save")
                }
            }
        }
    }
}
