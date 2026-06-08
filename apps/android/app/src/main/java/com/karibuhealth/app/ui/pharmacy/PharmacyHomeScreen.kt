package com.karibuhealth.app.ui.pharmacy

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import com.karibuhealth.app.ui.adaptive.karibuDialogModifier
import com.karibuhealth.app.ui.adaptive.KaribuAdaptiveQueue
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusKind
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Ink

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PharmacyHomeScreen(
    onNavigateToVisit: (String) -> Unit,
    onNavigateToWorklists: () -> Unit,
    onNavigateToBilling: () -> Unit = {},
    viewModel: PharmacyHomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var dispenseDialogVisit by remember { mutableStateOf<NeedsPharmacyItem?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pharmacy queue") },
                actions = {
                    // Patients pay at the pharmacy when they collect their drugs.
                    IconButton(onClick = onNavigateToBilling) {
                        Icon(Icons.Default.Payments, contentDescription = "Billing")
                    }
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
            if (uiState.items.isEmpty() && !uiState.isLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No orders waiting", color = Ink.copy(alpha = 0.6f))
                }
            } else {
                KaribuAdaptiveQueue(
                    items = uiState.items,
                    key = { it.visitId },
                    modifier = Modifier.fillMaxSize(),
                ) { item ->
                    PharmacyQueueCard(
                        item = item,
                        busy = uiState.actionVisitId == item.visitId,
                        onOpen = { onNavigateToVisit(item.visitId) },
                        onStart = { viewModel.markInProgress(item.visitId) },
                        onDispense = { dispenseDialogVisit = item },
                    )
                }
            }
        }
    }

    dispenseDialogVisit?.let { item ->
        var notes by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { dispenseDialogVisit = null },
            modifier = karibuDialogModifier(),
            title = { Text("Dispense — ${item.patientName}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(item.medications.orEmpty(), style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Notes (optional)") },
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.dispense(item.visitId, "dispensed", notes.ifBlank { null }, item.medications)
                        dispenseDialogVisit = null
                    },
                ) { Text("Dispensed") }
            },
            dismissButton = {
                Row {
                    TextButton(
                        onClick = {
                            viewModel.dispense(item.visitId, "partial", notes.ifBlank { null }, item.medications)
                            dispenseDialogVisit = null
                        },
                    ) { Text("Partial") }
                    TextButton(onClick = { dispenseDialogVisit = null }) { Text("Cancel") }
                }
            },
        )
    }
}

@Composable
private fun PharmacyQueueCard(
    item: NeedsPharmacyItem,
    busy: Boolean,
    onOpen: () -> Unit,
    onStart: () -> Unit,
    onDispense: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(item.patientName, fontWeight = FontWeight.SemiBold)
            KhMetaText(item.medications.orEmpty().take(120))
            Spacer(Modifier.height(8.dp))
            KhStatusPill(
                kind = KhStatusKind.Ready,
                label = item.dispensingStatus ?: "not_started",
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (item.dispensingStatus == "not_started") {
                    OutlinedButton(onClick = onStart, enabled = !busy) { Text("Start") }
                }
                OutlinedButton(onClick = onDispense, enabled = !busy) { Text("Dispense") }
            }
        }
    }
}
