package com.karibuhealth.app.ui.billing

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.PatientBalanceItem
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.AmberInk
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Line
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingHomeScreen(
    onNavigateBack: () -> Unit,
    onOpenPatientBill: (String) -> Unit,
    viewModel: BillingHomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val withBalance = uiState.patients.filter { it.balance > 0 }
    val paidUp = uiState.patients.filter { it.balance <= 0 }

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
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                uiState.isLoading -> {
                    Text(
                        "Loading…",
                        modifier = Modifier.padding(KaribuLayout.contentPaddingHorizontal(), 20.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                uiState.error != null -> {
                    Text(
                        uiState.error ?: "Error",
                        modifier = Modifier.padding(KaribuLayout.contentPaddingHorizontal(), 20.dp),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                uiState.patients.isEmpty() -> {
                    Text(
                        "No bills yet. Charges appear when labs are completed or pharmacy dispenses.",
                        modifier = Modifier.padding(KaribuLayout.contentPaddingHorizontal(), 20.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(
                            horizontal = KaribuLayout.contentPaddingHorizontal(),
                            vertical = 12.dp,
                        ),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (withBalance.isNotEmpty()) {
                            item {
                                Text(
                                    "Outstanding",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(bottom = 4.dp),
                                )
                            }
                            items(withBalance, key = { it.patientId }) { item ->
                                PatientBalanceRow(
                                    item = item,
                                    emphasizeBalance = true,
                                    onClick = { onOpenPatientBill(item.patientId) },
                                )
                            }
                        }
                        if (paidUp.isNotEmpty()) {
                            item {
                                Text(
                                    "Paid up",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                                )
                            }
                            items(paidUp.take(20), key = { it.patientId }) { item ->
                                PatientBalanceRow(
                                    item = item,
                                    emphasizeBalance = false,
                                    onClick = { onOpenPatientBill(item.patientId) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PatientBalanceRow(
    item: PatientBalanceItem,
    emphasizeBalance: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = item.patientName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = Cobalt,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = formatUgx(if (emphasizeBalance) item.balance else item.charged),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = if (emphasizeBalance && item.balance > 0) AmberInk else MaterialTheme.colorScheme.onSurface,
            )
        }
        KhMetaText(
            text = if (emphasizeBalance) {
                "${formatUgx(item.paid)} paid of ${formatUgx(item.charged)}"
            } else {
                "Charged ${formatUgx(item.charged)}"
            },
        )
    }
}

internal fun formatUgx(amount: Long): String =
    "UGX ${NumberFormat.getNumberInstance(Locale.US).format(amount)}"

internal fun formatUgx(amount: Int): String = formatUgx(amount.toLong())
