package com.karibuhealth.app.ui.dictation

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.theme.KaribuHealthTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DictationScreen(
    visitId: String,
    aiMode: Boolean,
    onNavigateBack: () -> Unit,
    onSubmitted: (String) -> Unit,
    viewModel: DictationViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(visitId, aiMode) {
        viewModel.load(visitId, aiMode)
    }

    LaunchedEffect(uiState.submitted) {
        if (uiState.submitted) onSubmitted(visitId)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) viewModel.startRecording()
    }

    DictationScreenContent(
        uiState = uiState,
        onNavigateBack = onNavigateBack,
        onTranscriptChange = viewModel::updateTranscript,
        onMicClick = {
            if (uiState.isRecording) {
                viewModel.stopRecordingAndTranscribe()
            } else if (uiState.aiMode && viewModel.hasMicrophonePermission()) {
                viewModel.startRecording()
            } else if (uiState.aiMode) {
                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        },
        onDismissError = viewModel::dismissError,
        onSubmit = { viewModel.submit(visitId) },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DictationScreenContent(
    uiState: DictationUiState,
    onNavigateBack: () -> Unit,
    onTranscriptChange: (String) -> Unit,
    onMicClick: () -> Unit,
    onDismissError: () -> Unit,
    onSubmit: () -> Unit,
) {
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .padding(bottom = 132.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (uiState.aiMode) {
                        "Speak the SOAP note in your own words. The AI will structure it for you."
                    } else {
                        "Type the note now and save it locally. You can send it to AI later when data is available."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                OutlinedTextField(
                    value = uiState.transcript,
                    onValueChange = onTranscriptChange,
                    label = { Text("Transcript (you can edit before submitting)") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 320.dp),
                    placeholder = {
                        Text(
                            if (uiState.aiMode) {
                                "Tap the microphone below and speak. Your words will appear here."
                            } else {
                                "Type here, or use Android keyboard voice typing for a local draft."
                            }
                        )
                    },
                    enabled = !uiState.isSubmitting,
                )

                if (!uiState.aiMode) {
                    AssistChip(
                        onClick = {},
                        enabled = false,
                        label = { Text("AI dictation needs sync + enough signal") },
                    )
                }

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
                            TextButton(onClick = onDismissError) {
                                Text("Dismiss")
                            }
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
                tonalElevation = 2.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (uiState.aiMode) {
                        FilledIconButton(
                            onClick = onMicClick,
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
                    } else {
                        Spacer(modifier = Modifier.size(72.dp))
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = when {
                                !uiState.aiMode -> if (uiState.savedLocally) "Draft saved locally" else "Local draft"
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
                        onClick = onSubmit,
                        enabled = uiState.canSubmit,
                    ) {
                        if (uiState.isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text(if (uiState.aiMode) "Send to AI" else "Save Local")
                        }
                    }
                }
            }
        }
    }
}

@Preview(showBackground = true, widthDp = 393, heightDp = 852)
@Composable
private fun DictationScreenPreview() {
    KaribuHealthTheme {
        DictationScreenContent(
            uiState = DictationUiState(
                transcript = "Adult patient with three days of fever, cough, and headache. Exam notable for temperature 38.1 and mild crackles at the right base. Assessment is community acquired pneumonia. Plan amoxicillin, fluids, and review in 48 hours.",
                aiMode = true,
            ),
            onNavigateBack = {},
            onTranscriptChange = {},
            onMicClick = {},
            onDismissError = {},
            onSubmit = {},
        )
    }
}
