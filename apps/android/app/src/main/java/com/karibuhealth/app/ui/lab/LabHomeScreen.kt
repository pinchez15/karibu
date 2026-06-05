package com.karibuhealth.app.ui.lab

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.NeedsLabItem
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.adaptive.karibuDialogModifier
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusKind
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Ink

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabHomeScreen(
    onNavigateToVisit: (String) -> Unit,
    onNavigateToWorklists: () -> Unit,
    viewModel: LabHomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var resultDialogVisit by remember { mutableStateOf<NeedsLabItem?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Lab queue") },
                actions = {
                    IconButton(onClick = onNavigateToWorklists) {
                        Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Worklists")
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isLoading,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier.padding(padding),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                uiState.error?.let { msg ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = msg,
                                modifier = Modifier.weight(1f),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            TextButton(onClick = viewModel::dismissError) {
                                Text("Dismiss")
                            }
                        }
                    }
                }
                if (uiState.items.isEmpty() && !uiState.isLoading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No pending lab work", color = Ink.copy(alpha = 0.6f))
                    }
                }                 else {
                    KaribuAdaptiveQueue(
                        items = uiState.items,
                        key = { it.visitId },
                        modifier = Modifier.fillMaxSize(),
                    ) { item ->
                        LabQueueCard(
                            item = item,
                            busy = uiState.actionVisitId == item.visitId,
                            onOpen = { onNavigateToVisit(item.visitId) },
                            onStart = { viewModel.startLab(item.visitId) },
                            onRecord = { resultDialogVisit = item },
                        )
                    }
                }
            }
        }
    }

    resultDialogVisit?.let { item ->
        var resultText by remember(item.visitId) { mutableStateOf("") }
        var abnormal by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { resultDialogVisit = null },
            modifier = karibuDialogModifier(),
            title = { Text("Record result — ${item.patientName}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = resultText,
                        onValueChange = { resultText = it },
                        label = { Text("Result") },
                        minLines = 3,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = abnormal, onCheckedChange = { abnormal = it })
                        Text("Abnormal")
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.recordResult(item.visitId, resultText, abnormal)
                        resultDialogVisit = null
                    },
                    enabled = resultText.isNotBlank(),
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { resultDialogVisit = null }) { Text("Cancel") }
            },
        )
    }

}

@Composable
private fun LabQueueCard(
    item: NeedsLabItem,
    busy: Boolean,
    onOpen: () -> Unit,
    onStart: () -> Unit,
    onRecord: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(item.patientName, fontWeight = FontWeight.SemiBold)
            KhMetaText(
                listOfNotNull(
                    item.sex,
                    item.derivedAge?.let { "$it y" },
                    item.chiefComplaint,
                ).joinToString(" · "),
            )
            Spacer(Modifier.height(8.dp))
            KhStatusPill(
                kind = KhStatusKind.Lab,
                label = item.labStatus ?: "pending",
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (item.labStatus == "pending") {
                    Button(
                        onClick = onStart,
                        enabled = !busy,
                        colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                    ) { Text("Start") }
                }
                if (item.labStatus == "running" || item.labStatus == "pending") {
                    OutlinedButton(onClick = onRecord, enabled = !busy) {
                        Text("Record result")
                    }
                }
            }
        }
    }
}
