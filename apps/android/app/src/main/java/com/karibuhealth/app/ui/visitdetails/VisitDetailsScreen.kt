package com.karibuhealth.app.ui.visitdetails

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.VisitStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VisitDetailsScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onNavigateToDictation: (String, Boolean) -> Unit,
    onNavigateToReview: (String) -> Unit,
    viewModel: VisitDetailsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(visitId) {
        viewModel.loadVisit(visitId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Visit Details") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Patient info
                uiState.patient?.let { patient ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Patient", style = MaterialTheme.typography.labelMedium)
                            Text(
                                patient.displayName ?: "Unknown",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            patient.patientNumber?.let {
                                Text("ID: $it", style = MaterialTheme.typography.bodySmall)
                            }
                            patient.whatsappNumber?.let {
                                Text(it, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }

                // Visit info
                uiState.visit?.let { visit ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        ),
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("AI dictation", style = MaterialTheme.typography.labelMedium)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                uiState.aiAvailabilityMessage,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Visit", style = MaterialTheme.typography.labelMedium)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text("Status")
                                Text(visit.status.name, fontWeight = FontWeight.Medium)
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text("Date")
                                Text(visit.visitDate)
                            }
                            visit.chiefComplaint?.let {
                                Spacer(Modifier.height(8.dp))
                                Text("Chief Complaint", style = MaterialTheme.typography.labelSmall)
                                Text(it)
                            }
                            visit.diagnosis?.let {
                                Spacer(Modifier.height(8.dp))
                                Text("Diagnosis", style = MaterialTheme.typography.labelSmall)
                                Text(it)
                            }
                            visit.medications?.let {
                                Spacer(Modifier.height(8.dp))
                                Text("Medications", style = MaterialTheme.typography.labelSmall)
                                Text(it)
                            }
                        }
                    }

                    // Provider note
                    uiState.providerNote?.let { note ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    "Provider Note",
                                    style = MaterialTheme.typography.labelMedium,
                                )
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    note.noteContent ?: note.transcript ?: "Pending...",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    }

                    // Actions based on visit status
                    Spacer(Modifier.height(8.dp))

                    when (visit.status) {
                        VisitStatus.pending -> {
                            if (uiState.hasLocalDraft) {
                                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Card(
                                        colors = CardDefaults.cardColors(
                                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                        ),
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Column(modifier = Modifier.padding(16.dp)) {
                                            Text(
                                                "Draft saved locally",
                                                fontWeight = FontWeight.Medium,
                                            )
                                            Spacer(Modifier.height(4.dp))
                                            Text(
                                                "You can keep editing offline. Use AI Dictation when sync and signal are ready.",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }

                                    OutlinedButton(
                                        onClick = { onNavigateToDictation(visitId, false) },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Default.Mic, contentDescription = null)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Open Local Draft")
                                    }

                                    Button(
                                        onClick = { onNavigateToDictation(visitId, true) },
                                        modifier = Modifier.fillMaxWidth(),
                                        enabled = uiState.canUseAiDictation,
                                    ) {
                                        Icon(Icons.Default.Mic, contentDescription = null)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Send Draft to AI")
                                    }
                                }
                            } else if (uiState.providerNote?.transcript?.isNotBlank() == true) {
                                Card(
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                    ),
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        Text(
                                            "AI is structuring your dictation…",
                                            fontWeight = FontWeight.Medium,
                                        )
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            "This usually takes under a minute. The visit will move to Review when it's ready.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            } else {
                                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    OutlinedButton(
                                        onClick = { onNavigateToDictation(visitId, false) },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Default.Mic, contentDescription = null)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Local Dictation")
                                    }

                                    Button(
                                        onClick = { onNavigateToDictation(visitId, true) },
                                        modifier = Modifier.fillMaxWidth(),
                                        enabled = uiState.canUseAiDictation,
                                    ) {
                                        Icon(Icons.Default.Mic, contentDescription = null)
                                        Spacer(Modifier.width(8.dp))
                                        Text("AI Dictation")
                                    }
                                }
                            }
                        }
                        VisitStatus.review -> {
                            Button(
                                onClick = { onNavigateToReview(visitId) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Default.RateReview, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Review Notes")
                            }
                        }
                        VisitStatus.error -> {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                OutlinedButton(
                                    onClick = { onNavigateToDictation(visitId, false) },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Icon(Icons.Default.Mic, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Edit Local Draft")
                                }

                                Button(
                                    onClick = { onNavigateToDictation(visitId, true) },
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = uiState.canUseAiDictation,
                                ) {
                                    Icon(Icons.Default.Mic, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Retry AI Dictation")
                                }
                            }
                        }
                        else -> {}
                    }

                    visit.errorMessage?.let { error ->
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                            ),
                        ) {
                            Text(
                                error,
                                modifier = Modifier.padding(16.dp),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                }
            }
        }
    }
}
