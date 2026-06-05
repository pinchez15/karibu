package com.karibuhealth.app.ui.billing

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.NeedsPaymentItem
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.adaptive.KaribuListDetailScaffold
import com.karibuhealth.app.ui.adaptive.ListDetailEmptyPlaceholder
import com.karibuhealth.app.ui.adaptive.supportsListDetail
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.payment.PaymentScreen
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Line

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingHomeScreen(
    onNavigateBack: () -> Unit,
    onNavigateToVisit: (String) -> Unit,
    onNavigateToPayment: (String) -> Unit = onNavigateToVisit,
    onPaymentRecorded: () -> Unit = {},
    viewModel: BillingHomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedVisitId by rememberSaveable { mutableStateOf<String?>(null) }
    val listDetail = supportsListDetail()

    fun openItem(item: NeedsPaymentItem) {
        if (listDetail) {
            selectedVisitId = item.visitId
        } else {
            onNavigateToPayment(item.visitId)
        }
    }

    val listContent: @Composable () -> Unit = {
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            if (uiState.isLoading) {
                Text(
                    "Loading…",
                    modifier = Modifier.padding(KaribuLayout.contentPaddingHorizontal(), 20.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (uiState.items.isEmpty()) {
                Text(
                    "No visits awaiting payment.",
                    modifier = Modifier.padding(KaribuLayout.contentPaddingHorizontal(), 20.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(
                        horizontal = KaribuLayout.contentPaddingHorizontal(),
                        vertical = 12.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.items, key = { it.visitId }) { item ->
                        BillingPaymentRow(
                            item = item,
                            selected = listDetail && selectedVisitId == item.visitId,
                            onClick = { openItem(item) },
                        )
                    }
                }
            }
        }
    }

    val detailContent: @Composable () -> Unit = {
        val visitId = selectedVisitId ?: return@Composable
        PaymentScreen(
            visitId = visitId,
            embedInPane = true,
            onNavigateBack = { selectedVisitId = null },
            onPaymentComplete = {
                onPaymentRecorded()
                viewModel.refresh()
                selectedVisitId = null
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Billing") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (listDetail) {
            KaribuListDetailScaffold(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                listContent = listContent,
                showDetail = selectedVisitId != null,
                emptyDetail = {
                    ListDetailEmptyPlaceholder(
                        title = "Select a visit",
                        subtitle = "Tap a patient awaiting payment to record cash or skip.",
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
private fun BillingPaymentRow(
    item: NeedsPaymentItem,
    onClick: () -> Unit,
    selected: Boolean = false,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (selected) CobaltSoft.copy(alpha = 0.35f)
                else MaterialTheme.colorScheme.surface,
            )
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) Cobalt else Line,
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = item.patientName,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = Cobalt,
        )
        item.diagnosis?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = "Dx: $it",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item.visitDate?.let { KhMetaText(text = it) }
    }
}
