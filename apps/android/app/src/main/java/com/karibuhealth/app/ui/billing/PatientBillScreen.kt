package com.karibuhealth.app.ui.billing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.BillingPaymentItem
import com.karibuhealth.app.domain.model.ChargeItem
import com.karibuhealth.app.ui.adaptive.KaribuAdaptiveWidthBox
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.AmberInk

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientBillScreen(
    onNavigateBack: () -> Unit,
    viewModel: PatientBillViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.patientName) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = false,
            onRefresh = { viewModel.load() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            KaribuAdaptiveWidthBox(
                modifier = Modifier.fillMaxSize(),
                maxWidth = KaribuLayout.constrainedFormMaxWidth(),
            ) {
                if (uiState.isLoading) {
                    Column(Modifier.padding(KaribuLayout.contentPadding())) {
                        CircularProgressIndicator()
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = KaribuLayout.contentPadding(),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        item {
                            BalanceSummary(
                                charged = uiState.balance.charged,
                                paid = uiState.balance.paid,
                                balance = uiState.balance.balance,
                            )
                        }

                        item {
                            Text("Charges", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        }

                        val activeCharges = uiState.charges.filter { !it.voided }
                        if (activeCharges.isEmpty()) {
                            item {
                                Text(
                                    "No charges yet. They are added automatically when labs complete or pharmacy dispenses.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        } else {
                            items(activeCharges, key = { it.id }) { charge ->
                                ChargeRow(
                                    charge = charge,
                                    canVoid = uiState.isAdmin,
                                    isSaving = uiState.isSaving,
                                    onVoid = { viewModel.voidCharge(charge.id) },
                                )
                            }
                        }

                        if (uiState.isAdmin) {
                            item {
                                Text(
                                    "Record payment",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                KhMetaText(text = "Partial payments and cash + barter supported.")
                            }
                            item {
                                PaymentForm(
                                    payMethod = uiState.payMethod,
                                    payCash = uiState.payCash,
                                    payBarter = uiState.payBarter,
                                    payBarterDesc = uiState.payBarterDesc,
                                    isSaving = uiState.isSaving,
                                    onMethodChange = viewModel::updatePayMethod,
                                    onCashChange = viewModel::updatePayCash,
                                    onBarterChange = viewModel::updatePayBarter,
                                    onBarterDescChange = viewModel::updatePayBarterDesc,
                                    onSubmit = viewModel::recordPayment,
                                )
                            }
                        }

                        if (uiState.payments.isNotEmpty()) {
                            item {
                                Text(
                                    "Payments",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            items(uiState.payments, key = { it.id }) { payment ->
                                PaymentHistoryRow(payment)
                            }
                        }

                        uiState.error?.let { error ->
                            item {
                                Text(error, color = MaterialTheme.colorScheme.error)
                            }
                        }
                        uiState.successMessage?.let { msg ->
                            item {
                                Text(msg, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BalanceSummary(charged: Long, paid: Long, balance: Long) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            KhMetaText(text = "CHARGED")
            Text(formatUgx(charged), fontWeight = FontWeight.SemiBold)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            KhMetaText(text = "PAID")
            Text(formatUgx(paid), fontWeight = FontWeight.SemiBold)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            KhMetaText(text = "BALANCE")
            Text(
                formatUgx(balance),
                fontWeight = FontWeight.Bold,
                color = if (balance > 0) AmberInk else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun ChargeRow(
    charge: ChargeItem,
    canVoid: Boolean,
    isSaving: Boolean,
    onVoid: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(charge.description, style = MaterialTheme.typography.bodyLarge)
            KhMetaText(
                text = buildString {
                    charge.category?.let { append(it.replaceFirstChar { c -> c.uppercase() }) }
                    if (charge.quantity != 1.0) append(" · qty ${charge.quantity}")
                    charge.unitPriceUgx?.let { append(" · ${formatUgx(it)}/unit") }
                },
            )
        }
        Text(formatUgx(charge.amountUgx), fontWeight = FontWeight.SemiBold)
        if (canVoid) {
            IconButton(onClick = onVoid, enabled = !isSaving) {
                Icon(Icons.Default.Delete, contentDescription = "Remove charge")
            }
        }
    }
}

@Composable
private fun PaymentHistoryRow(payment: BillingPaymentItem) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        KhMetaText(text = payment.receiptNumber?.let { "#$it" } ?: payment.paymentMethod)
        Column(horizontalAlignment = Alignment.End) {
            if (payment.amountUgx > 0) Text(formatUgx(payment.amountUgx))
            if (payment.amountBarterUgx > 0) {
                Text(
                    "${formatUgx(payment.amountBarterUgx)} barter",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PaymentForm(
    payMethod: String,
    payCash: String,
    payBarter: String,
    payBarterDesc: String,
    isSaving: Boolean,
    onMethodChange: (String) -> Unit,
    onCashChange: (String) -> Unit,
    onBarterChange: (String) -> Unit,
    onBarterDescChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = payMethod == "cash",
                onClick = { onMethodChange("cash") },
                label = { Text("Cash") },
            )
            FilterChip(
                selected = payMethod == "mixed",
                onClick = { onMethodChange("mixed") },
                label = { Text("Cash + barter") },
            )
            FilterChip(
                selected = payMethod == "barter",
                onClick = { onMethodChange("barter") },
                label = { Text("Barter") },
            )
        }
        if (payMethod != "barter") {
            OutlinedTextField(
                value = payCash,
                onValueChange = onCashChange,
                label = { Text("Cash / mobile (UGX)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        }
        if (payMethod == "barter" || payMethod == "mixed") {
            OutlinedTextField(
                value = payBarter,
                onValueChange = onBarterChange,
                label = { Text("Barter value (UGX)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            OutlinedTextField(
                value = payBarterDesc,
                onValueChange = onBarterDescChange,
                label = { Text("Barter description") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }
        Button(onClick = onSubmit, enabled = !isSaving, modifier = Modifier.fillMaxWidth()) {
            if (isSaving) {
                CircularProgressIndicator(modifier = Modifier.padding(4.dp))
            } else {
                Text("Record payment")
            }
        }
    }
}
