package com.karibuhealth.app.ui.dictation

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.KaribuHealthTheme
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DictationScreen(
    visitId: String,
    aiMode: Boolean,
    onNavigateBack: () -> Unit,
    onSubmitted: (String) -> Unit,
    viewModel: DictationViewModel = hiltViewModel(),
) {
    @Suppress("UNUSED_PARAMETER")
    val ignoredAiMode = aiMode

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
        onSectionsChange = viewModel::updateSections,
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
    onSectionsChange: (ClinicalNoteSections) -> Unit,
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
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Column {
                        Text(
                            "Note",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = Ink,
                        )
                        KhMetaText(text = "DICTATION")
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(end = 16.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Wifi,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = Green,
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "ONLINE",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = Green,
                            fontSize = 11.sp,
                        )
                    }
                },
            )
        },
        bottomBar = {
            DictationBottomToolbar(
                uiState = uiState,
                onToggleWhisper = onToggleWhisper,
                onSubmit = onSubmit,
                wordCount = wordCount,
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val sections = uiState.sections

            Text(
                text = "Clinical note",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = Ink,
            )

            SectionField(
                label = "CHIEF COMPLAINT",
                value = sections.chiefComplaint,
                placeholder = "Fever for 3 days",
                minLines = 1,
                onValueChange = { onSectionsChange(sections.copy(chiefComplaint = it)) },
                enabled = !uiState.isSubmitting,
            )
            SectionField(
                label = "HISTORY OF PRESENT ILLNESS",
                value = sections.hpi,
                placeholder = "Onset, duration, associated symptoms, relevant negatives",
                onValueChange = { onSectionsChange(sections.copy(hpi = it)) },
                enabled = !uiState.isSubmitting,
            )
            SectionField(
                label = "PHYSICAL EXAM",
                value = sections.physicalExam,
                placeholder = "General appearance, vitals, focused exam findings",
                onValueChange = { onSectionsChange(sections.copy(physicalExam = it)) },
                enabled = !uiState.isSubmitting,
            )
            SectionField(
                label = "FAMILY AND SOCIAL HISTORY",
                value = sections.familySocialHistory,
                placeholder = "Household exposure, pregnancy, smoking/alcohol, family conditions",
                onValueChange = { onSectionsChange(sections.copy(familySocialHistory = it)) },
                enabled = !uiState.isSubmitting,
            )
            SectionField(
                label = "DIAGNOSIS",
                value = sections.diagnosis,
                placeholder = "Malaria, dehydration, URI, hypertension...",
                minLines = 1,
                onValueChange = { onSectionsChange(sections.copy(diagnosis = it)) },
                enabled = !uiState.isSubmitting,
            )
            SectionField(
                label = "ASSESSMENT AND PLAN",
                value = sections.assessmentPlan,
                placeholder = "Clinical reasoning and treatment plan",
                onValueChange = { onSectionsChange(sections.copy(assessmentPlan = it)) },
                enabled = !uiState.isSubmitting,
            )
            SectionField(
                label = "PHARMACY",
                value = sections.medications,
                placeholder = "Amoxicillin 500 mg TDS x 5 days",
                onValueChange = { onSectionsChange(sections.copy(medications = it)) },
                enabled = !uiState.isSubmitting,
            )
            SectionField(
                label = "LABS",
                value = sections.testsOrdered,
                placeholder = "Malaria RDT, Hb, urinalysis",
                onValueChange = { onSectionsChange(sections.copy(testsOrdered = it)) },
                enabled = !uiState.isSubmitting,
            )

            FollowUpTaskPicker(
                selected = sections.followUpTasks,
                enabled = !uiState.isSubmitting,
                onSelectedChange = { onSectionsChange(sections.copy(followUpTasks = it)) },
            )
            SectionField(
                label = "FOLLOW-UP DETAILS",
                value = sections.followUpInstructions,
                placeholder = "Return in 48 hours, danger signs, referral instructions",
                onValueChange = { onSectionsChange(sections.copy(followUpInstructions = it)) },
                enabled = !uiState.isSubmitting,
            )

            Text(
                text = "Dictation / extra notes",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = Ink,
                modifier = Modifier.padding(top = 8.dp),
            )
            BasicTextField(
                value = sections.additionalNote,
                onValueChange = onTranscriptChange,
                textStyle = TextStyle(
                    color = Ink,
                    fontSize = 17.sp,
                    lineHeight = 26.sp,
                    fontWeight = FontWeight.Normal,
                ),
                cursorBrush = SolidColor(Cobalt),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, Line, RoundedCornerShape(12.dp))
                    .padding(12.dp),
                enabled = !uiState.isSubmitting,
                decorationBox = { inner ->
                    if (sections.additionalNote.isEmpty()) {
                        Text(
                            text = "Free dictation lands here. Use the fields above for the structured receipt and queues.",
                            color = Muted,
                            style = TextStyle(fontSize = 17.sp, lineHeight = 26.sp),
                        )
                    }
                    inner()
                },
            )

            uiState.error?.let { error ->
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.errorContainer,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
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

@Composable
private fun SectionField(
    label: String,
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    minLines: Int = 2,
) {
    Column {
        KhMetaText(text = label)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, color = Muted) },
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            minLines = minLines,
            maxLines = 5,
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Cobalt,
                unfocusedBorderColor = Line,
            ),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FollowUpTaskPicker(
    selected: List<String>,
    enabled: Boolean,
    onSelectedChange: (List<String>) -> Unit,
) {
    val options = listOf(
        "Get script from pharmacy",
        "Get labs drawn",
        "Return for review",
        "Referral",
    )
    Column {
        KhMetaText(text = "FOLLOW-UP TASKS")
        Spacer(Modifier.height(6.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { option ->
                FilterChip(
                    selected = option in selected,
                    onClick = {
                        if (!enabled) return@FilterChip
                        val next = if (option in selected) selected - option else selected + option
                        onSelectedChange(next)
                    },
                    enabled = enabled,
                    label = { Text(option) },
                )
            }
        }
    }
}

@Composable
private fun DictationBottomToolbar(
    uiState: DictationUiState,
    onToggleWhisper: () -> Unit,
    onSubmit: () -> Unit,
    wordCount: Int,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .imePadding(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        Box(modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Line, RoundedCornerShape(0.dp))
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Big primary mic button — 56dp per design.
                //
                // Stop is ALWAYS available while recording, even if a chunk
                // is mid-upload. In-flight transcription continues
                // independently after stop and gets appended when it lands.
                // The button only gates Start (new recording) on no other
                // operation in flight.
                val buttonEnabled = uiState.isRecording ||
                    (!uiState.isSubmitting && !uiState.isTranscribing)
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (uiState.isRecording) Amber else Cobalt)
                        .clickable(
                            enabled = buttonEnabled,
                            onClick = onToggleWhisper,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    // Always show the action icon when recording — never
                    // swap it for a spinner. The "Transcribing…" label in
                    // the toolbar already conveys the in-flight state.
                    when {
                        uiState.isRecording -> Icon(
                            imageVector = Icons.Default.Stop,
                            contentDescription = "Stop",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                        uiState.isTranscribing -> CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.5.dp,
                            color = Color.White,
                        )
                        else -> Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = "Record",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = when {
                            uiState.isRecording -> "Recording… tap to stop"
                            uiState.isTranscribing -> "Whisper transcribing…"
                            uiState.savedLocally -> "Saved · ready to print"
                            else -> "Tap mic, or use keyboard voice"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = Body,
                    )
                    KhMetaText(
                        text = "$wordCount WORDS" + if (uiState.savedLocally) " · AUTO-SAVED" else "",
                    )
                }

                Button(
                    onClick = onSubmit,
                    enabled = uiState.canSubmit,
                    colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    if (uiState.isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Color.White,
                        )
                    } else {
                        Text("Save", fontWeight = FontWeight.SemiBold)
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
            onSectionsChange = {},
            onDismissError = {},
            onSubmit = {},
            onStructureWithAi = {},
            onToggleWhisper = {},
        )
    }
}
