package com.karibuhealth.app.ui.pharmacy

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
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
import com.karibuhealth.app.domain.model.PharmacyQueueTab
import com.karibuhealth.app.domain.model.pharmacyTabForVisit
import com.karibuhealth.app.ui.adaptive.KaribuAdaptiveQueue
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusKind
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.theme.Ink

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PharmacyHomeScreen(
    onNavigateToVisit: (String) -> Unit,
    onNavigateToBilling: () -> Unit = {},
    viewModel: PharmacyHomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var worksheetItem by remember { mutableStateOf<NeedsPharmacyItem?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }
    val filtered = viewModel.filteredItems

    LaunchedEffect(uiState.stockWarning) {
        uiState.stockWarning?.let { warning ->
            snackbarHostState.showSnackbar(warning, withDismissAction = true)
            viewModel.dismissStockWarning()
        }
    }
    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            snackbarHostState.showSnackbar(error, withDismissAction = true)
            viewModel.dismissError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Pharmacy") },
                actions = {
                    IconButton(onClick = onNavigateToBilling) {
                        Icon(Icons.Default.Payments, contentDescription = "Billing")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = viewModel::updateSearch,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Filter by name or #") },
                singleLine = true,
            )
            PharmacyTabRow(
                selected = uiState.selectedTab,
                items = uiState.items,
                onSelect = viewModel::selectTab,
            )
            PullToRefreshBox(
                isRefreshing = uiState.isLoading,
                onRefresh = { viewModel.refresh() },
                modifier = Modifier.weight(1f),
            ) {
                if (filtered.isEmpty() && !uiState.isLoading) {
                    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text(
                            "No orders in this tab. Visits appear after a clinician submits a pharmacy order.",
                            color = Ink.copy(alpha = 0.6f),
                        )
                    }
                } else {
                    KaribuAdaptiveQueue(
                        items = filtered,
                        key = { it.visitId },
                        modifier = Modifier.fillMaxSize(),
                    ) { item ->
                        PharmacyQueueCard(
                            item = item,
                            busy = uiState.actionVisitId == item.visitId,
                            onOpen = { onNavigateToVisit(item.visitId) },
                            onWorksheet = { worksheetItem = item },
                        )
                    }
                }
            }
        }
    }

    worksheetItem?.let { item ->
        PrescriptionWorksheetSheet(
            item = item,
            busy = uiState.actionVisitId == item.visitId,
            onDismiss = { worksheetItem = null },
            onStart = { viewModel.startDispense(item.visitId) },
            onComplete = { drafts, notes ->
                viewModel.completeDispense(item.visitId, drafts, notes.ifBlank { null })
                worksheetItem = null
            },
            onSendBack = { reason ->
                viewModel.sendBackToClinician(item.visitId, reason)
                worksheetItem = null
            },
            onSendLineBack = { lineId, reason ->
                viewModel.sendLineBackToClinician(item.visitId, lineId, reason)
                worksheetItem = null
            },
        )
    }
}

@Composable
private fun PharmacyTabRow(
    selected: PharmacyQueueTab,
    items: List<NeedsPharmacyItem>,
    onSelect: (PharmacyQueueTab) -> Unit,
) {
    val tabs = listOf(
        PharmacyQueueTab.Waiting to "Waiting",
        PharmacyQueueTab.InProgress to "In progress",
        PharmacyQueueTab.DoneToday to "Done today",
    )
    ScrollableTabRow(
        selectedTabIndex = tabs.indexOfFirst { it.first == selected }.coerceAtLeast(0),
    ) {
        tabs.forEach { (tab, label) ->
            val count = items.count { pharmacyTabForVisit(it.dispensingStatus, it.dispensedAt) == tab }
            Tab(
                selected = selected == tab,
                onClick = { onSelect(tab) },
                text = { Text(if (count > 0) "$label ($count)" else label) },
            )
        }
    }
}

@Composable
private fun PharmacyQueueCard(
    item: NeedsPharmacyItem,
    busy: Boolean,
    onOpen: () -> Unit,
    onWorksheet: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                item.queuePosition?.takeIf { it > 0 }?.let { num ->
                    Text(
                        text = "#$num",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = com.karibuhealth.app.ui.theme.Cobalt,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                }
                Text(item.patientName, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            }
            val preview = item.prescriptionLines.firstOrNull()?.displayName()
                ?: item.medications.orEmpty().take(120)
            KhMetaText(preview)
            if (item.prescriptionLines.size > 1) {
                KhMetaText("${item.prescriptionLines.size} prescription lines")
            }
            Spacer(Modifier.height(8.dp))
            KhStatusPill(
                kind = KhStatusKind.Ready,
                label = item.dispensingStatus ?: "not_started",
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onWorksheet, enabled = !busy) {
                Text("Open worksheet")
            }
        }
    }
}
