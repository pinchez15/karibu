package com.karibuhealth.app.ui.orders

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.adaptive.KaribuListDetailScaffold
import com.karibuhealth.app.ui.adaptive.ListDetailEmptyPlaceholder
import com.karibuhealth.app.ui.adaptive.supportsListDetail
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.patientdetail.PatientTimelineScreen
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.visitdetails.VisitDetailsScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersScreen(
    onOpenVisit: (String) -> Unit,
    onOpenPatient: (String) -> Unit,
    onAddPatientNote: (String) -> Unit = {},
    onRecordPatientVitals: (String) -> Unit = {},
    onNavigateToReferral: (String) -> Unit = {},
    onNavigateToDictation: (String, Boolean) -> Unit = { _, _ -> },
    onNavigateToReview: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: OrdersViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedRowId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedVisitId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedPatientId by rememberSaveable { mutableStateOf<String?>(null) }
    val listDetail = supportsListDetail()

    fun openRow(row: OrderRow) {
        if (listDetail) {
            selectedRowId = row.id
            selectedVisitId = row.visitId
            selectedPatientId = row.patientId
        } else {
            row.visitId?.let(onOpenVisit) ?: onOpenPatient(row.patientId)
        }
    }

    val listContent: @Composable () -> Unit = {
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    top = 12.dp,
                    bottom = KaribuLayout.bottomBarScrollPadding().dp,
                ),
            ) {
                item {
                    Column(
                        modifier = Modifier.padding(
                            horizontal = KaribuLayout.contentPaddingHorizontal(),
                            vertical = 8.dp,
                        ),
                    ) {
                        Text(
                            "Orders & status",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        KhMetaText(text = "TODAY · LABS · PHARMACY · REFERRALS")
                    }
                }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(
                                horizontal = KaribuLayout.contentPaddingHorizontal(),
                                vertical = 4.dp,
                            ),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OrderCategory.entries.forEach { category ->
                            FilterChip(
                                selected = uiState.selectedCategory == category,
                                onClick = { viewModel.selectCategory(category) },
                                label = {
                                    Text(
                                        when (category) {
                                            OrderCategory.All -> "All"
                                            OrderCategory.Labs -> "Labs"
                                            OrderCategory.Pharmacy -> "Pharmacy"
                                            OrderCategory.Referrals -> "Referrals"
                                        },
                                    )
                                },
                            )
                        }
                    }
                }
                if (uiState.rows.isEmpty() && !uiState.isLoading) {
                    item {
                        Text(
                            "No orders yet today.",
                            modifier = Modifier.padding(
                                horizontal = KaribuLayout.contentPaddingHorizontal(),
                                vertical = 16.dp,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    items(uiState.rows, key = { it.id }) { row ->
                        OrderRowCard(
                            row = row,
                            selected = listDetail && selectedRowId == row.id,
                            onClick = { openRow(row) },
                            modifier = Modifier.padding(
                                horizontal = KaribuLayout.contentPaddingHorizontal(),
                                vertical = 4.dp,
                            ),
                        )
                    }
                }
            }
        }
    }

    val detailContent: @Composable () -> Unit = {
        when {
            selectedVisitId != null -> VisitDetailsScreen(
                visitId = selectedVisitId!!,
                embedInPane = true,
                onNavigateBack = {
                    selectedRowId = null
                    selectedVisitId = null
                    selectedPatientId = null
                },
                onNavigateToReferral = onNavigateToReferral,
                onNavigateToDictation = { visitId, aiMode, _ ->
                    onNavigateToDictation(visitId, aiMode)
                },
                onNavigateToReview = onNavigateToReview,
            )
            selectedPatientId != null -> PatientTimelineScreen(
                patientId = selectedPatientId!!,
                embedInPane = true,
                onNavigateBack = {
                    selectedRowId = null
                    selectedVisitId = null
                    selectedPatientId = null
                },
                onNavigateToVisit = onOpenVisit,
                onAddNote = onAddPatientNote,
                onRecordVitals = onRecordPatientVitals,
                onNavigateToReferral = onNavigateToReferral,
                onNavigateToDictation = { visitId ->
                    onNavigateToDictation(visitId, false)
                },
            )
        }
    }

    Scaffold(modifier = modifier) { padding ->
        if (listDetail) {
            KaribuListDetailScaffold(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                listContent = listContent,
                showDetail = selectedVisitId != null || selectedPatientId != null,
                emptyDetail = {
                    ListDetailEmptyPlaceholder(
                        title = "Select an order",
                        subtitle = "Tap a lab, pharmacy, or referral row to see visit status.",
                    )
                },
                detailContent = detailContent,
            )
        } else {
            Column(Modifier.padding(padding)) {
                listContent()
            }
        }
    }
}

@Composable
private fun OrderRowCard(
    row: OrderRow,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
) {
    val kindLabel = when (row.kind) {
        OrderKind.Lab -> "Lab"
        OrderKind.Pharmacy -> "Pharmacy"
        OrderKind.Referral -> "Referral"
    }
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) CobaltSoft.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surface,
        tonalElevation = if (selected) 0.dp else 1.dp,
        border = if (selected) androidx.compose.foundation.BorderStroke(2.dp, Cobalt) else null,
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    row.patientName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                KhStatusPill(label = row.statusLabel, kind = row.statusKind)
            }
            KhMetaText(text = kindLabel.uppercase())
            Text(
                row.summary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}
