package com.karibuhealth.app.ui.vitals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStepIndicator
import com.karibuhealth.app.ui.components.KhVitalCard
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.AmberSoft
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted

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

    val tempHot = uiState.tempC.toDoubleOrNull()?.let { it >= 38.0 } == true
    val bpHigh = uiState.bpSystolic.toIntOrNull()?.let { it >= 140 } == true ||
        uiState.bpDiastolic.toIntOrNull()?.let { it >= 90 } == true
    val spo2Low = uiState.spo2Pct.toIntOrNull()?.let { it < 94 } == true

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Text(
                        "Vitals",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    Box(modifier = Modifier.padding(end = 16.dp)) {
                        KhMetaText(text = "STEP 2 / 3")
                    }
                },
            )
        },
        bottomBar = {
            Surface(
                modifier = Modifier.fillMaxWidth().imePadding(),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp,
            ) {
                Box(modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Line, RoundedCornerShape(0.dp))
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 16.dp)
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(
                            onClick = { onContinue(visitId) },
                            modifier = Modifier.weight(1f),
                            enabled = !uiState.isSaving,
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(vertical = 14.dp),
                        ) { Text("Skip") }

                        Button(
                            onClick = { viewModel.save(patientId = patientId, visitId = visitId) },
                            modifier = Modifier.weight(2f),
                            enabled = !uiState.isSaving,
                            colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(vertical = 14.dp),
                        ) {
                            if (uiState.isSaving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = Color.White,
                                )
                            } else {
                                Text("Save and continue", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            KhStepIndicator(step = 2, totalSteps = 3, label = "VITALS")

            // Sticky-feeling patient strip — identity always anchored.
            // (Not actually pinned; sticky pinning would need a constraint
            // layout tweak. The card is always near the top of the scroll.)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, Line, RoundedCornerShape(10.dp))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Patient #${patientId.take(8)}",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = Ink,
                        )
                        KhMetaText(text = "VISIT ${visitId.take(8).uppercase()}")
                    }
                    KhMetaText(text = "ALL FIELDS OPTIONAL")
                }
            }

            // Row: HEIGHT + WEIGHT (dose-critical pair, top of layout per design)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KhVitalCard(
                    label = "HEIGHT",
                    value = uiState.heightCm,
                    unit = "cm",
                    decimal = true,
                    onValueChange = viewModel::updateHeight,
                    modifier = Modifier.weight(1f),
                )
                KhVitalCard(
                    label = "WEIGHT",
                    value = uiState.weightKg,
                    unit = "kg",
                    decimal = true,
                    onValueChange = viewModel::updateWeight,
                    modifier = Modifier.weight(1f),
                )
            }

            // Row: BP SYS + BP DIA (paired together per design)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KhVitalCard(
                    label = "BP SYS",
                    value = uiState.bpSystolic,
                    unit = "mmHg",
                    onValueChange = viewModel::updateBpSystolic,
                    modifier = Modifier.weight(1f),
                    hot = bpHigh,
                )
                KhVitalCard(
                    label = "BP DIA",
                    value = uiState.bpDiastolic,
                    unit = "mmHg",
                    onValueChange = viewModel::updateBpDiastolic,
                    modifier = Modifier.weight(1f),
                    hot = bpHigh,
                )
            }

            // Row: PULSE + RESP
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KhVitalCard(
                    label = "PULSE",
                    value = uiState.pulseBpm,
                    unit = "bpm",
                    onValueChange = viewModel::updatePulse,
                    modifier = Modifier.weight(1f),
                )
                KhVitalCard(
                    label = "RESP",
                    value = uiState.respRate,
                    unit = "/min",
                    onValueChange = viewModel::updateRespRate,
                    modifier = Modifier.weight(1f),
                )
            }

            // Row: TEMP + SpO₂
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KhVitalCard(
                    label = "TEMP",
                    value = uiState.tempC,
                    unit = "°C",
                    decimal = true,
                    onValueChange = viewModel::updateTemp,
                    modifier = Modifier.weight(1f),
                    hot = tempHot,
                )
                KhVitalCard(
                    label = "SpO₂",
                    value = uiState.spo2Pct,
                    unit = "%",
                    onValueChange = viewModel::updateSpo2,
                    modifier = Modifier.weight(1f),
                    hot = spo2Low,
                )
            }

            // Row: MUAC alone (half width per design)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KhVitalCard(
                    label = "MUAC",
                    value = uiState.muacCm,
                    unit = "cm",
                    decimal = true,
                    onValueChange = viewModel::updateMuac,
                    modifier = Modifier.weight(1f),
                    imeAction = ImeAction.Next,
                )
                Spacer(Modifier.weight(1f))
            }

            // Inline AI hint card — design's amber-tinted dose advisor.
            if (tempHot && uiState.weightKg.isNotBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(AmberSoft)
                        .border(1.dp, Amber.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                        .padding(12.dp),
                ) {
                    Row {
                        Box(
                            modifier = Modifier
                                .padding(top = 7.dp)
                                .size(6.dp)
                                .clip(RoundedCornerShape(50))
                                .background(Amber),
                        )
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Fever flagged",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = Amber,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = "Use weight ${uiState.weightKg} kg to confirm pediatric dose. Consider malaria RDT.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Body,
                            )
                        }
                    }
                }
            }

            OutlinedTextField(
                value = uiState.notes,
                onValueChange = viewModel::updateNotes,
                label = { Text("Notes (optional)", color = Muted) },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Cobalt,
                    unfocusedBorderColor = Line,
                ),
            )

            uiState.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}
