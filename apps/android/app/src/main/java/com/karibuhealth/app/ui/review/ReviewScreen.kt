package com.karibuhealth.app.ui.review

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onApproved: (String) -> Unit,
    onRejected: (String) -> Unit,
    viewModel: ReviewViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(visitId) {
        viewModel.loadVisit(visitId)
    }

    // The viewmodel sets these flags after the server confirms the action; we
    // navigate from here (rather than inline at the button) so the user sees
    // the loading spinner long enough to know the request actually happened.
    LaunchedEffect(uiState.approved) {
        if (uiState.approved) onApproved(visitId)
    }
    LaunchedEffect(uiState.rejected) {
        if (uiState.rejected) onRejected(visitId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review Notes") },
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
                contentAlignment = androidx.compose.ui.Alignment.Center,
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
                // Provider Note
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Provider Note (SOAP)",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            uiState.providerNote?.noteContent ?: "No note available",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                // Transcript
                uiState.providerNote?.transcript?.let { transcript ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Transcript",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                transcript,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                // Patient Summary
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Patient Summary",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            uiState.patientNote?.content ?: "No summary available",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                uiState.error?.let { error ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                        ) {
                            Text(
                                text = error,
                                modifier = Modifier.weight(1f),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            TextButton(onClick = { viewModel.dismissError() }) {
                                Text("Dismiss")
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                val isBusy = uiState.isApproving || uiState.isRejecting

                Button(
                    onClick = { viewModel.approveNote(visitId) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isBusy,
                ) {
                    if (uiState.isApproving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text("Approve & Send to Patient")
                    }
                }
                // Reject = AI got it wrong. Server clears the structured note +
                // patient summary, keeps the original transcript so the
                // clinician can edit it on the dictation screen instead of
                // starting over.
                OutlinedButton(
                    onClick = { viewModel.rejectNote(visitId) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isBusy,
                ) {
                    if (uiState.isRejecting) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Re-dictate (AI got it wrong)")
                    }
                }
            }
        }
    }
}
