package com.karibuhealth.app.ui.dictation

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DictationScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onSubmitted: (String) -> Unit,
    viewModel: DictationViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.submitted) {
        if (uiState.submitted) onSubmitted(visitId)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) viewModel.startRecording()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Dictate visit note") },
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
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Speak the SOAP note in your own words. The AI will structure it for you.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            OutlinedTextField(
                value = uiState.transcript,
                onValueChange = { viewModel.updateTranscript(it) },
                label = { Text("Transcript (you can edit before submitting)") },
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                placeholder = {
                    Text("Tap the microphone below and speak. Your words will appear here.")
                },
                enabled = !uiState.isSubmitting,
            )

            if (uiState.isTranscribing) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Text(
                        "Transcribing...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            uiState.error?.let { error ->
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
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

            // Mic + submit row. The mic toggles record state; submit appears only
            // when there is enough transcript to structure.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilledIconButton(
                    onClick = {
                        if (uiState.isRecording) {
                            viewModel.stopRecordingAndTranscribe()
                        } else if (viewModel.hasMicrophonePermission()) {
                            viewModel.startRecording()
                        } else {
                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                    modifier = Modifier.size(72.dp),
                    enabled = !uiState.isTranscribing && !uiState.isSubmitting,
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (uiState.isRecording) MaterialTheme.colorScheme.error
                        else MaterialTheme.colorScheme.primary,
                    ),
                ) {
                    Icon(
                        if (uiState.isRecording) Icons.Default.Stop else Icons.Default.Mic,
                        contentDescription = if (uiState.isRecording) "Stop" else "Record",
                        modifier = Modifier.size(32.dp),
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = when {
                            uiState.isRecording -> "Recording — tap to stop"
                            uiState.isTranscribing -> "Transcribing..."
                            uiState.transcript.isEmpty() -> "Tap to dictate"
                            else -> "Tap to add more"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        text = "${uiState.transcript.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.size} words",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Button(
                    onClick = { viewModel.submit(visitId) },
                    enabled = uiState.canSubmit,
                ) {
                    if (uiState.isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text("Submit")
                    }
                }
            }
        }
    }
}
