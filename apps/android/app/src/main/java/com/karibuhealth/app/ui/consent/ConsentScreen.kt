package com.karibuhealth.app.ui.consent

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.SourceLanguage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsentScreen(
    patientId: String,
    onNavigateBack: () -> Unit,
    onConsentGranted: (String) -> Unit,
    viewModel: ConsentViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // Navigate when visit is created
    LaunchedEffect(uiState.createdVisitId) {
        uiState.createdVisitId?.let { onConsentGranted(it) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Patient Consent") },
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
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "DPPA Consent Required",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "All consent items must be granted before recording can begin.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Language toggle
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Recording Language", style = MaterialTheme.typography.labelLarge)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = uiState.sourceLanguage == SourceLanguage.eng,
                            onClick = { viewModel.updateSourceLanguage(SourceLanguage.eng) },
                            label = { Text("English") },
                        )
                        FilterChip(
                            selected = uiState.sourceLanguage == SourceLanguage.local,
                            onClick = { /* disabled for now */ },
                            label = { Text("Local Language") },
                            enabled = false,
                        )
                    }
                }
            }

            // Consent toggles
            ConsentToggleItem(
                title = "Audio Recording",
                description = "I consent to this consultation being audio recorded.",
                checked = uiState.consentRecording,
                onCheckedChange = { viewModel.updateConsentRecording(it) },
            )
            ConsentToggleItem(
                title = "AI Processing",
                description = "I consent to the recording being processed by AI to generate clinical notes.",
                checked = uiState.consentAiProcessing,
                onCheckedChange = { viewModel.updateConsentAiProcessing(it) },
            )
            ConsentToggleItem(
                title = "Data Storage",
                description = "I consent to my health data being stored securely.",
                checked = uiState.consentStorage,
                onCheckedChange = { viewModel.updateConsentStorage(it) },
            )
            ConsentToggleItem(
                title = "Cross-Border Transfer",
                description = "I consent to my data being processed by servers outside Uganda.",
                checked = uiState.consentCrossBorder,
                onCheckedChange = { viewModel.updateConsentCrossBorder(it) },
            )

            // Minor/guardian
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row {
                        Checkbox(checked = uiState.isMinor, onCheckedChange = { viewModel.updateIsMinor(it) })
                        Text(
                            "Patient is a minor (under 18)",
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    if (uiState.isMinor) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = uiState.guardianName,
                            onValueChange = { viewModel.updateGuardianName(it) },
                            label = { Text("Guardian Name") },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = uiState.guardianRelationship,
                            onValueChange = { viewModel.updateGuardianRelationship(it) },
                            label = { Text("Relationship to Patient") },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            uiState.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = { viewModel.createVisitWithConsent(patientId) },
                modifier = Modifier.fillMaxWidth(),
                enabled = uiState.canProceed && !uiState.isCreating,
            ) {
                if (uiState.isCreating) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    Text("Start Recording")
                }
            }
        }
    }
}

@Composable
private fun ConsentToggleItem(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.labelLarge)
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = checked, onCheckedChange = onCheckedChange)
        }
    }
}
