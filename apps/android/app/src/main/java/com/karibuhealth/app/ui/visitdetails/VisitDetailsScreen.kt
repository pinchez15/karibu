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
    onNavigateToPayment: (String) -> Unit,
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
                            if (uiState.hasPendingVisitSync) {
                                Spacer(Modifier.height(12.dp))
                                OutlinedButton(
                                    onClick = { viewModel.trySync(visitId) },
                                    enabled = !uiState.isSyncing && uiState.connectionStatus.isOnline,
                                ) {
                                    if (uiState.isSyncing) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            strokeWidth = 2.dp,
                                        )
                                        Spacer(Modifier.width(8.dp))
                                    }
                                    Text(if (uiState.isSyncing) "Syncing…" else "Try Sync")
                                }
                            }
                            if (uiState.syncErrors.isNotEmpty()) {
                                Spacer(Modifier.height(12.dp))
                                Text(
                                    "Sync errors (debug)",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                                uiState.syncErrors.forEach { err ->
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        "${err.operationType} (attempt ${err.attempts}): ${err.lastError}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
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

                    // Actions based on visit status + documentation flag.
                    Spacer(Modifier.height(8.dp))

                    val docComplete = visit.documentationComplete

                    when {
                        // Documentation not yet captured: primary CTA to write
                        // the note. No AI gating.
                        visit.status == VisitStatus.pending && !docComplete -> {
                            Button(
                                onClick = { onNavigateToDictation(visitId, false) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Default.Mic, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text(if (uiState.hasLocalDraft) "Continue note" else "Write note")
                            }
                        }
                        // Direct-saved visit (clinician hit Save → status='sent')
                        // OR an AI-approved visit. Either way, the visit is
                        // ready for payment.
                        visit.status == VisitStatus.sent -> {
                            Button(
                                onClick = { onNavigateToPayment(visitId) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Proceed to payment")
                            }
                            OutlinedButton(
                                onClick = { onNavigateToDictation(visitId, false) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Default.Mic, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Edit note")
                            }
                        }
                        // AI workflow: clinician triggered Structure with AI
                        // and Inngest is mid-flight. Status reverts to pending
                        // until the workflow flips to review (or error).
                        visit.status == VisitStatus.pending && docComplete -> {
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text("AI is structuring your note…", fontWeight = FontWeight.Medium)
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        "Should be ready in under a minute. The visit will move to Review.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        // Existing AI flow: clinician reviews AI output before
                        // approving / rejecting.
                        visit.status == VisitStatus.review -> {
                            Button(
                                onClick = { onNavigateToReview(visitId) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Default.RateReview, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Review Notes")
                            }
                        }
                        // AI failed — let the clinician re-edit and retry.
                        visit.status == VisitStatus.error -> {
                            Button(
                                onClick = { onNavigateToDictation(visitId, false) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Default.Mic, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Edit and retry")
                            }
                        }
                        // completed: nothing to do.
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
