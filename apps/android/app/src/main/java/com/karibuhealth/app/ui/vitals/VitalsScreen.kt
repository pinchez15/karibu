package com.karibuhealth.app.ui.vitals

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VitalsScreen(
    visitId: String,
    patientId: String,
    onNavigateBack: () -> Unit,
    onContinue: (visitId: String) -> Unit,
    viewModel: VitalsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.saved) {
        if (uiState.saved) onContinue(visitId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Vitals") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Record what you measured. All fields optional — leave blank for what you didn't take.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Weight + temp side-by-side (most common)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumericField(
                    value = uiState.weightKg,
                    onValueChange = viewModel::updateWeight,
                    label = "Weight (kg)",
                    decimal = true,
                    modifier = Modifier.weight(1f),
                )
                NumericField(
                    value = uiState.tempC,
                    onValueChange = viewModel::updateTemp,
                    label = "Temp (°C)",
                    decimal = true,
                    modifier = Modifier.weight(1f),
                )
            }

            // BP
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumericField(
                    value = uiState.bpSystolic,
                    onValueChange = viewModel::updateBpSystolic,
                    label = "BP systolic",
                    modifier = Modifier.weight(1f),
                )
                NumericField(
                    value = uiState.bpDiastolic,
                    onValueChange = viewModel::updateBpDiastolic,
                    label = "BP diastolic",
                    modifier = Modifier.weight(1f),
                )
            }

            // Pulse + resp
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumericField(
                    value = uiState.pulseBpm,
                    onValueChange = viewModel::updatePulse,
                    label = "Pulse (bpm)",
                    modifier = Modifier.weight(1f),
                )
                NumericField(
                    value = uiState.respRate,
                    onValueChange = viewModel::updateRespRate,
                    label = "Resp rate",
                    modifier = Modifier.weight(1f),
                )
            }

            // SpO2 + MUAC (situational)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumericField(
                    value = uiState.spo2Pct,
                    onValueChange = viewModel::updateSpo2,
                    label = "SpO₂ (%)",
                    modifier = Modifier.weight(1f),
                )
                NumericField(
                    value = uiState.muacCm,
                    onValueChange = viewModel::updateMuac,
                    label = "MUAC (cm)",
                    decimal = true,
                    modifier = Modifier.weight(1f),
                )
            }

            // Height — typically only on first visit / peds
            NumericField(
                value = uiState.heightCm,
                onValueChange = viewModel::updateHeight,
                label = "Height (cm)",
                decimal = true,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = uiState.notes,
                onValueChange = viewModel::updateNotes,
                label = { Text("Notes (optional)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )

            uiState.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Spacer(Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = { onContinue(visitId) },
                    modifier = Modifier.weight(1f),
                    enabled = !uiState.isSaving,
                ) {
                    Text("Skip")
                }
                Button(
                    onClick = { viewModel.save(patientId = patientId, visitId = visitId) },
                    modifier = Modifier.weight(1f),
                    enabled = !uiState.isSaving,
                ) {
                    if (uiState.isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text("Save and continue")
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun NumericField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    decimal: Boolean = false,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { input ->
            // Drop anything that isn't a digit (or a decimal point if allowed).
            val sanitized = input.filter { c ->
                c.isDigit() || (decimal && c == '.')
            }
            onValueChange(sanitized)
        },
        label = { Text(label) },
        modifier = modifier,
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number,
        ),
    )
}
