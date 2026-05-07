package com.karibuhealth.app.ui.dictation

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
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
    aiMode: Boolean,    // legacy nav param, ignored — Save flow no longer toggles AI here
    onNavigateBack: () -> Unit,
    onSubmitted: (String) -> Unit,
    viewModel: DictationViewModel = hiltViewModel(),
) {
    @Suppress("UNUSED_PARAMETER")
    val ignoredAiMode = aiMode    // silence unused-param lint

    val uiState by viewModel.uiState.collectAsState()
    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            viewModel.startRecording()
        } else {
            viewModel.onMicrophonePermissionDenied()
        }
    }

    LaunchedEffect(visitId) {
        viewModel.load(visitId)
    }

    LaunchedEffect(uiState.submitted) {
        if (uiState.submitted) onSubmitted(visitId)
    }

    DictationScreenContent(
        uiState = uiState,
        onNavigateBack = onNavigateBack,
        onTranscriptChange = viewModel::updateTranscript,
        onDismissError = viewModel::dismissError,
        onSubmit = { viewModel.submit(visitId) },
        onStructureWithAi = { viewModel.structureWithAi(visitId) },
        onToggleWhisper = {
            if (uiState.isRecording) {
                viewModel.stopRecordingAndTranscribe()
            } else if (viewModel.hasMicrophonePermission()) {
                viewModel.startRecording()
            } else {
                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DictationScreenContent(
    uiState: DictationUiState,
    onNavigateBack: () -> Unit,
    onTranscriptChange: (String) -> Unit,
    onDismissError: () -> Unit,
    onSubmit: () -> Unit,
    onStructureWithAi: () -> Unit,
    onToggleWhisper: () -> Unit,
) {
    val wordCount = uiState.transcript.trim()
        .split(Regex("\\s+"))
        .filter { it.isNotEmpty() }
        .size

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Visit note") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .imePadding(),
                tonalElevation = 2.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (uiState.savedLocally) "Note saved" else "$wordCount words",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = if (uiState.savedLocally)
                                "Pushes to Supabase when you have data."
                            else
                                "Type or use Google keyboard voice typing.",
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
                            Text("Save")
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Write or dictate the note in your own words. Tap Save when you're done — works offline. AI structuring is optional after saving.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilledTonalButton(
                    onClick = onToggleWhisper,
                    enabled = !uiState.isSubmitting && !uiState.isTranscribing,
                ) {
                    if (uiState.isRecording) {
                        Icon(Icons.Default.Stop, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Stop & transcribe")
                    } else {
                        Icon(Icons.Default.Mic, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Record with Whisper")
                    }
                }
                Text(
                    text = when {
                        uiState.isRecording -> "Recording… tap again to stop."
                        uiState.isTranscribing -> "Whisper is transcribing…"
                        else -> "Or use the Google keyboard microphone."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }

            OutlinedTextField(
                value = uiState.transcript,
                onValueChange = onTranscriptChange,
                label = { Text("Note") },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 320.dp),
                placeholder = {
                    Text("Type the note here, or tap the microphone on the Google keyboard to dictate.")
                },
                enabled = !uiState.isSubmitting,
            )

            // Small, low-emphasis "Structure with AI" button — secondary
            // affordance, only shown after the note has been saved at least once.
            if (uiState.savedLocally) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(
                        onClick = onStructureWithAi,
                        enabled = !uiState.isStructuringWithAi && uiState.transcript.trim().length >= 10,
                    ) {
                        if (uiState.isStructuringWithAi) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(14.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Sending…", style = MaterialTheme.typography.labelSmall)
                        } else {
                            Icon(
                                Icons.Default.AutoAwesome,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("Structure with AI", style = MaterialTheme.typography.labelSmall)
                        }
                    }
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
    }
}

@Preview(showBackground = true, widthDp = 393, heightDp = 852)
@Composable
private fun DictationScreenPreview() {
    KaribuHealthTheme {
        DictationScreenContent(
            uiState = DictationUiState(
                transcript = "Adult patient with three days of fever, cough, and headache. Exam notable for temperature 38.1 and mild crackles at the right base. Assessment is community acquired pneumonia. Plan amoxicillin, fluids, and review in 48 hours.",
                savedLocally = true,
            ),
            onNavigateBack = {},
            onTranscriptChange = {},
            onDismissError = {},
            onSubmit = {},
            onStructureWithAi = {},
            onToggleWhisper = {},
        )
    }
}
