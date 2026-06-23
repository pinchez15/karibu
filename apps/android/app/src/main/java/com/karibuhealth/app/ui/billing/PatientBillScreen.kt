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
                    val activeCharges = uiState.charges.filter { !it.voided }
                    val totalBill = activeCharges.sumOf { it.amountUgx.toLong() }
                    val totalPaid = uiState.payments.sumOf {
                        (it.amountUgx + it.amountBarterUgx).toLong()
                    }
                    val remaining = (totalBill - totalPaid).coerceAtLeast(0)
                    val payCashNum = if (uiState.payMethod == "barter") 0
                        else uiState.payCash.toIntOrNull() ?: 0
                    val payBarterNum = when (uiState.payMethod) {
                        "cash", "mtn_momo", "airtel_money" -> 0
                        else -> uiState.payBarter.toIntOrNull() ?: 0
                    }
                    val paymentBeingRecorded = payCashNum + payBarterNum
                    val remainingAfterPayment = (remaining - paymentBeingRecorded).coerceAtLeast(0)

                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = KaribuLayout.contentPadding(),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        item {
                            BalanceSummary(
                                totalBill = totalBill,
                                totalPaid = totalPaid,
                                remaining = remaining,
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
                                    isSaving = uiState.isSaving,
                                    onVoid = { viewModel.voidCharge(charge.id) },
                                )
                            }
                            item {
                                Row(
                                    Modifier.fillMaxWidth().padding(top = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text("Bill total", fontWeight = FontWeight.SemiBold)
                                    Text(formatUgx(totalBill.toInt()), fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }

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
                                remaining = remaining,
                                remainingAfterPayment = remainingAfterPayment,
                                paymentBeingRecorded = paymentBeingRecorded,
                                onMethodChange = viewModel::updatePayMethod,
                                onCashChange = viewModel::updatePayCash,
                                onBarterChange = viewModel::updatePayBarter,
                                onBarterDescChange = viewModel::updatePayBarterDesc,
                                onSubmit = viewModel::recordPayment,
                            )
                        }

                        if (uiState.payments.isNotEmpty()) {
                            item {
                                Row(
                                    Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        "Payments",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        "Total paid: ${formatUgx(totalPaid.toInt())}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
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
private fun BalanceSummary(totalBill: Long, totalPaid: Long, remaining: Long) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Bill summary", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            KhMetaText(text = "TOTAL BILL")
            Text(formatUgx(totalBill.toInt()), fontWeight = FontWeight.SemiBold)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            KhMetaText(text = "PAID")
            Text(formatUgx(totalPaid.toInt()), fontWeight = FontWeight.SemiBold)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            KhMetaText(text = "REMAINING")
            Text(
                formatUgx(remaining.toInt()),
                fontWeight = FontWeight.Bold,
                color = if (remaining > 0) AmberInk else MaterialTheme.colorScheme.onSurface,
            )
        }
        if (remaining > 0) {
            Text(
                "${formatUgx(totalPaid.toInt())} received of ${formatUgx(totalBill.toInt())} billed",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ChargeRow(
    charge: ChargeItem,
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
            charge.createdByName?.let {
                Text(
                    "Added by $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(formatUgx(charge.amountUgx), fontWeight = FontWeight.SemiBold)
        IconButton(onClick = onVoid, enabled = !isSaving) {
            Icon(Icons.Default.Delete, contentDescription = "Remove charge")
        }
    }
}

@Composable
private fun PaymentHistoryRow(payment: BillingPaymentItem) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Column {
            KhMetaText(text = payment.receiptNumber?.let { "#$it" } ?: payment.paymentMethod)
            payment.collectedByName?.let {
                Text(
                    "Received by $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
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
    remaining: Long,
    remainingAfterPayment: Long,
    paymentBeingRecorded: Int,
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
        Text(
            text = if (paymentBeingRecorded > 0) {
                "Remaining after this payment: ${formatUgx(remainingAfterPayment.toInt())}"
            } else {
                "Amount still owed: ${formatUgx(remaining.toInt())}"
            },
            style = MaterialTheme.typography.bodySmall,
            color = if (remainingAfterPayment > 0 || paymentBeingRecorded == 0) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.primary
            },
        )
        Button(onClick = onSubmit, enabled = !isSaving, modifier = Modifier.fillMaxWidth()) {
            if (isSaving) {
                CircularProgressIndicator(modifier = Modifier.padding(4.dp))
            } else {
                Text("Record payment")
            }
        }
    }
}
