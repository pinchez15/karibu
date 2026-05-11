package com.karibuhealth.app.ui.payment

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.PaymentMethod

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onPaymentComplete: (String) -> Unit,
    viewModel: PaymentViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.isComplete) {
        if (uiState.isComplete) onPaymentComplete(visitId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Record Payment") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            OutlinedTextField(
                value = uiState.amount,
                onValueChange = { viewModel.updateAmount(it) },
                label = { Text("Amount (UGX)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )

            Text("Payment Method", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = uiState.paymentMethod == PaymentMethod.cash,
                    onClick = { viewModel.updatePaymentMethod(PaymentMethod.cash) },
                    label = { Text("Cash") },
                )
                FilterChip(
                    selected = uiState.paymentMethod == PaymentMethod.mtn_momo,
                    onClick = { },
                    label = { Text("MTN MoMo") },
                    enabled = false,
                )
                FilterChip(
                    selected = uiState.paymentMethod == PaymentMethod.airtel_money,
                    onClick = { },
                    label = { Text("Airtel") },
                    enabled = false,
                )
            }

            uiState.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = { viewModel.recordPayment(visitId) },
                modifier = Modifier.fillMaxWidth(),
                enabled = uiState.amount.isNotBlank() && !uiState.isRecording,
            ) {
                if (uiState.isRecording) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    Text("Record Payment")
                }
            }

            TextButton(
                onClick = { viewModel.skipPayment(visitId) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isRecording,
            ) {
                Text("Skip Payment")
            }
        }
    }
}
