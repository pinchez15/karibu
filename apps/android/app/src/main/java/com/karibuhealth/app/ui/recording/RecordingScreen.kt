package com.karibuhealth.app.ui.recording

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
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
fun RecordingScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onRecordingComplete: (String) -> Unit,
    viewModel: RecordingViewModel = hiltViewModel(),
) {
    val recordingState by viewModel.recordingState.collectAsState()
    val durationSeconds by viewModel.durationSeconds.collectAsState()
    val error by viewModel.error.collectAsState()

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) viewModel.startRecording()
    }

    val minutes = durationSeconds / 60
    val seconds = durationSeconds % 60

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Recording") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (recordingState.isRecording) {
                            viewModel.cancelRecording()
                        }
                        onNavigateBack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Timer display
            Text(
                text = "%02d:%02d".format(minutes, seconds),
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Light,
            )

            Spacer(Modifier.height(48.dp))

            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(16.dp))
            }

            // Recording controls
            Row(
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (recordingState.isRecording) {
                    // Pause/resume
                    FilledTonalIconButton(
                        onClick = {
                            if (recordingState.isPaused) viewModel.resumeRecording()
                            else viewModel.pauseRecording()
                        },
                        modifier = Modifier.size(64.dp),
                    ) {
                        Icon(
                            if (recordingState.isPaused) Icons.Default.Mic else Icons.Default.Pause,
                            contentDescription = if (recordingState.isPaused) "Resume" else "Pause",
                            modifier = Modifier.size(32.dp),
                        )
                    }

                    // Stop
                    FilledIconButton(
                        onClick = {
                            viewModel.stopRecording(visitId)
                            onRecordingComplete(visitId)
                        },
                        modifier = Modifier.size(80.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                        ),
                    ) {
                        Icon(
                            Icons.Default.Stop,
                            contentDescription = "Stop Recording",
                            modifier = Modifier.size(40.dp),
                        )
                    }
                } else {
                    // Start recording
                    FilledIconButton(
                        onClick = {
                            if (viewModel.hasMicrophonePermission()) {
                                viewModel.startRecording()
                            } else {
                                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        },
                        modifier = Modifier.size(80.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                        ),
                    ) {
                        Icon(
                            Icons.Default.Mic,
                            contentDescription = "Start Recording",
                            modifier = Modifier.size(40.dp),
                        )
                    }
                }
            }

            Spacer(Modifier.height(32.dp))

            Text(
                text = when {
                    !recordingState.isRecording -> "Tap to start recording"
                    recordingState.isPaused -> "Recording paused"
                    else -> "Recording in progress..."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
