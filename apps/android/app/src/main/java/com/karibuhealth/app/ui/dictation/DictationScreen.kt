package com.karibuhealth.app.ui.dictation

import android.Manifest
import androidx.activity.compose.BackHandler
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.adaptive.KaribuTwoColumnRow
import com.karibuhealth.app.ui.adaptive.supportsMultiColumn
import com.karibuhealth.app.ui.adaptive.usesNavigationRail
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.data.remote.dto.summaryText
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
    incorporateSection: String? = null,
    incorporatePrefill: String? = null,
    openLabPicker: Boolean = false,
    openRxPicker: Boolean = false,
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

    LaunchedEffect(visitId, incorporateSection, incorporatePrefill, openLabPicker, openRxPicker) {
        val section = incorporateSection?.let { runCatching { NoteSection.valueOf(it) }.getOrNull() }
        viewModel.load(
            visitId = visitId,
            incorporateSection = section,
            incorporatePrefill = incorporatePrefill,
            openLabPickerOnLoad = openLabPicker,
            openRxPickerOnLoad = openRxPicker,
        )
    }

    LaunchedEffect(uiState.submitted) {
        if (uiState.submitted) onSubmitted(visitId)
    }

    val exitAfterSave = { viewModel.saveDraftAndExit(onNavigateBack) }

    BackHandler(onBack = exitAfterSave)

    DictationScreenContent(
        uiState = uiState,
        onNavigateBack = exitAfterSave,
        onTranscriptChange = viewModel::updateTranscript,
        onSectionsChange = viewModel::updateSections,
        onFocusedSectionChange = viewModel::setFocusedSection,
        onDismissError = viewModel::dismissError,
        onSubmit = { viewModel.signNote(visitId) },
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
        onSendToPharmacy = viewModel::sendToPharmacy,
        onAppendPrescriptionLine = viewModel::appendPrescriptionLine,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DictationScreenContent(
    uiState: DictationUiState,
    onNavigateBack: () -> Unit,
    onTranscriptChange: (String) -> Unit,
    onSectionsChange: (ClinicalNoteSections) -> Unit,
    onFocusedSectionChange: (NoteSection?) -> Unit,
    onDismissError: () -> Unit,
    onSubmit: () -> Unit,
    onStructureWithAi: () -> Unit,
    onToggleWhisper: () -> Unit,
    onSendToPharmacy: () -> Unit,
    onAppendPrescriptionLine: (PharmacyPickerResult) -> Unit,
) {
    var showLabPicker by remember { mutableStateOf(false) }
    var signConfirmPending by remember { mutableStateOf(false) }
    val tabletLayout = usesNavigationRail()
    var quickNoteMode by rememberSaveable { mutableStateOf(!tabletLayout) }
    var expandedSections by rememberSaveable { mutableStateOf(tabletLayout) }

    LaunchedEffect(uiState.sections, uiState.transcript, uiState.isRecording, uiState.isTranscribing) {
        signConfirmPending = false
    }

    var showRxPicker by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.openLabPickerOnLoad) {
        if (uiState.openLabPickerOnLoad) showLabPicker = true
    }
    LaunchedEffect(uiState.openRxPickerOnLoad) {
        if (uiState.openRxPickerOnLoad) showRxPicker = true
    }

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
                            color = MaterialTheme.colorScheme.onSurface,
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
                    val online = uiState.isOnline
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(end = 16.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Wifi,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = if (online) Green else Muted,
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = uiState.connectionLabel.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = if (online) Green else Muted,
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
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 12.dp)
                .padding(bottom = KaribuLayout.bottomBarScrollPadding().dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val sections = uiState.sections
            val multiColumn = supportsMultiColumn()

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (quickNoteMode) "Quick note" else "Clinical note",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { quickNoteMode = !quickNoteMode }) {
                        Text(if (quickNoteMode) "Full SOAP" else "Quick note")
                    }
                    AutosaveStatusIndicator(status = uiState.autosaveStatus)
                }
            }

            val clinicalFields: @Composable () -> Unit = {
                DictationClinicalFields(
                    uiState = uiState,
                    sections = sections,
                    quickNoteMode = quickNoteMode,
                    expandedSections = expandedSections,
                    onExpandSections = { expandedSections = true },
                    onSectionsChange = onSectionsChange,
                    onFocusedSectionChange = onFocusedSectionChange,
                    onSendToPharmacy = onSendToPharmacy,
                    onOpenLabPicker = { showLabPicker = true },
                    onOpenRxPicker = { showRxPicker = true },
                )
            }
            val notesPane: @Composable () -> Unit = {
                DictationNotesAndSignPane(
                    uiState = uiState,
                    sections = sections,
                    multiColumn = multiColumn,
                    onTranscriptChange = onTranscriptChange,
                    onFocusedSectionChange = onFocusedSectionChange,
                    signConfirmPending = signConfirmPending,
                    onDismissError = onDismissError,
                    onSignClick = {
                        if (signConfirmPending) {
                            onSubmit()
                        } else {
                            signConfirmPending = true
                        }
                    },
                )
            }

            if (multiColumn) {
                KaribuTwoColumnRow(
                    leftWeight = 0.58f,
                    rightWeight = 0.42f,
                    spacing = 20.dp,
                    left = {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            clinicalFields()
                        }
                    },
                    right = {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            notesPane()
                        }
                    },
                )
            } else {
                clinicalFields()
                notesPane()
            }

            if (showLabPicker) {
                LabPickerSheet(
                    patientSex = uiState.patientSex,
                    ageYears = uiState.patientAgeYears,
                    onDismiss = { showLabPicker = false },
                    onConfirm = { addition ->
                        val current = sections.testsOrdered
                        val merged = listOf(current, addition)
                            .filter { it.isNotBlank() }
                            .joinToString(", ")
                        onSectionsChange(sections.copy(testsOrdered = merged))
                        showLabPicker = false
                    },
                )
            }

            if (showRxPicker) {
                PharmacyPickerSheet(
                    onDismiss = { showRxPicker = false },
                    onConfirm = { result ->
                        val current = sections.medications
                        val merged = listOf(current, result.displaySig)
                            .filter { it.isNotBlank() }
                            .joinToString("\n")
                        onSectionsChange(sections.copy(medications = merged))
                        onAppendPrescriptionLine(result)
                        showRxPicker = false
                    },
                )
            }
        }
    }
}

/**
 * Structured SOAP fields — left column on tablet.
 */
@Composable
private fun DictationClinicalFields(
    uiState: DictationUiState,
    sections: ClinicalNoteSections,
    quickNoteMode: Boolean,
    expandedSections: Boolean,
    onExpandSections: () -> Unit,
    onSectionsChange: (ClinicalNoteSections) -> Unit,
    onFocusedSectionChange: (NoteSection?) -> Unit,
    onSendToPharmacy: () -> Unit,
    onOpenLabPicker: () -> Unit,
    onOpenRxPicker: () -> Unit,
) {
    SectionField(
        label = "CHIEF COMPLAINT",
        value = sections.chiefComplaint,
        section = NoteSection.ChiefComplaint,
        onFocusChange = onFocusedSectionChange,
        minLines = 1,
        placeholder = "e.g. fever and cough x3 days",
        onValueChange = { onSectionsChange(sections.copy(chiefComplaint = it)) },
        enabled = sectionFieldEnabled(uiState, NoteSection.ChiefComplaint),
        isRecordingTarget = uiState.recordingSection == NoteSection.ChiefComplaint && uiState.isRecording,
        isTranscribingTarget = uiState.transcribingSection == NoteSection.ChiefComplaint && uiState.isTranscribing,
    )
    if (!quickNoteMode || expandedSections) {
        SectionField(
            label = "HISTORY OF PRESENT ILLNESS",
            value = sections.hpi,
            section = NoteSection.Hpi,
            onFocusChange = onFocusedSectionChange,
            placeholder = "Onset, duration, severity, associated symptoms…",
            onValueChange = { onSectionsChange(sections.copy(hpi = it)) },
            enabled = sectionFieldEnabled(uiState, NoteSection.Hpi),
            isRecordingTarget = uiState.recordingSection == NoteSection.Hpi && uiState.isRecording,
            isTranscribingTarget = uiState.transcribingSection == NoteSection.Hpi && uiState.isTranscribing,
        )
        SectionField(
            label = "PHYSICAL EXAM",
            value = sections.physicalExam,
            section = NoteSection.PhysicalExam,
            onFocusChange = onFocusedSectionChange,
            placeholder = "Vitals, general appearance, focused exam…",
            onValueChange = { onSectionsChange(sections.copy(physicalExam = it)) },
            enabled = sectionFieldEnabled(uiState, NoteSection.PhysicalExam),
            isRecordingTarget = uiState.recordingSection == NoteSection.PhysicalExam && uiState.isRecording,
            isTranscribingTarget = uiState.transcribingSection == NoteSection.PhysicalExam && uiState.isTranscribing,
        )
        SectionField(
            label = "FAMILY AND SOCIAL HISTORY",
            value = sections.familySocialHistory,
            section = NoteSection.FamilySocialHistory,
            onFocusChange = onFocusedSectionChange,
            placeholder = "Relevant family history, social context…",
            onValueChange = { onSectionsChange(sections.copy(familySocialHistory = it)) },
            enabled = sectionFieldEnabled(uiState, NoteSection.FamilySocialHistory),
            isRecordingTarget = uiState.recordingSection == NoteSection.FamilySocialHistory && uiState.isRecording,
            isTranscribingTarget = uiState.transcribingSection == NoteSection.FamilySocialHistory && uiState.isTranscribing,
        )
    } else {
        TextButton(onClick = onExpandSections) {
            Text("More sections (HPI, exam, history)")
        }
    }
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "LABS",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            AddLabsChip(onClick = onOpenLabPicker)
        }
        Spacer(Modifier.height(4.dp))
        SectionField(
            label = null,
            value = sections.testsOrdered,
            section = NoteSection.TestsOrdered,
            onFocusChange = onFocusedSectionChange,
            placeholder = "Labs ordered or use Add labs…",
            onValueChange = { onSectionsChange(sections.copy(testsOrdered = it)) },
            enabled = sectionFieldEnabled(uiState, NoteSection.TestsOrdered),
            isRecordingTarget = uiState.recordingSection == NoteSection.TestsOrdered && uiState.isRecording,
            isTranscribingTarget = uiState.transcribingSection == NoteSection.TestsOrdered && uiState.isTranscribing,
        )
    }
    SectionField(
        label = "DIAGNOSIS",
        value = sections.diagnosis,
        section = NoteSection.Diagnosis,
        onFocusChange = onFocusedSectionChange,
        minLines = 1,
        placeholder = "Primary diagnosis or working impression…",
        onValueChange = { onSectionsChange(sections.copy(diagnosis = it)) },
        enabled = sectionFieldEnabled(uiState, NoteSection.Diagnosis),
        isRecordingTarget = uiState.recordingSection == NoteSection.Diagnosis && uiState.isRecording,
        isTranscribingTarget = uiState.transcribingSection == NoteSection.Diagnosis && uiState.isTranscribing,
    )
    SectionField(
        label = "ASSESSMENT AND PLAN",
        value = sections.assessmentPlan,
        section = NoteSection.AssessmentPlan,
        onFocusChange = onFocusedSectionChange,
        placeholder = "Clinical reasoning, plan, counseling…",
        onValueChange = { onSectionsChange(sections.copy(assessmentPlan = it)) },
        enabled = sectionFieldEnabled(uiState, NoteSection.AssessmentPlan),
        isRecordingTarget = uiState.recordingSection == NoteSection.AssessmentPlan && uiState.isRecording,
        isTranscribingTarget = uiState.transcribingSection == NoteSection.AssessmentPlan && uiState.isTranscribing,
    )
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "PHARMACY",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            AddRxChip(onClick = onOpenRxPicker)
        }
        Spacer(Modifier.height(4.dp))
        if (uiState.prescriptionLines.isNotEmpty()) {
            uiState.prescriptionLines.forEach { line ->
                val label = line.summaryText()
                if (label.isNotBlank()) {
                    Text(label, style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(4.dp))
        }
        SectionField(
            label = null,
            value = sections.medications,
            section = NoteSection.Medications,
            onFocusChange = onFocusedSectionChange,
            placeholder = "Medications or use Add Rx…",
            onValueChange = { onSectionsChange(sections.copy(medications = it)) },
            enabled = sectionFieldEnabled(uiState, NoteSection.Medications),
            isRecordingTarget = uiState.recordingSection == NoteSection.Medications && uiState.isRecording,
            isTranscribingTarget = uiState.transcribingSection == NoteSection.Medications && uiState.isTranscribing,
        )
        Spacer(Modifier.height(8.dp))
        if (uiState.pharmacyOrderSubmitted) {
            Text(
                "Sent to pharmacy",
                color = Green,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
            )
        } else {
            OutlinedButton(
                onClick = onSendToPharmacy,
                enabled = !uiState.isSubmitting &&
                    !uiState.isSendingToPharmacy &&
                    !uiState.isRecording &&
                    !uiState.isTranscribing &&
                    (sections.medications.isNotBlank() || uiState.prescriptionLines.isNotEmpty()),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (uiState.isSendingToPharmacy) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp))
                } else {
                    Text("Send to pharmacy")
                }
            }
        }
    }
    FollowUpTaskPicker(
        selected = sections.followUpTasks,
        enabled = !uiState.isSubmitting && !uiState.isRecording && !uiState.isTranscribing,
        onSelectedChange = { onSectionsChange(sections.copy(followUpTasks = it)) },
    )
    SectionField(
        label = "FOLLOW-UP DETAILS",
        value = sections.followUpInstructions,
        section = NoteSection.FollowUpInstructions,
        onFocusChange = onFocusedSectionChange,
        placeholder = "Return precautions, referrals, next visit…",
        onValueChange = { onSectionsChange(sections.copy(followUpInstructions = it)) },
        enabled = sectionFieldEnabled(uiState, NoteSection.FollowUpInstructions),
        isRecordingTarget = uiState.recordingSection == NoteSection.FollowUpInstructions && uiState.isRecording,
        isTranscribingTarget = uiState.transcribingSection == NoteSection.FollowUpInstructions && uiState.isTranscribing,
    )
}

@Composable
private fun DictationNotesAndSignPane(
    uiState: DictationUiState,
    sections: ClinicalNoteSections,
    multiColumn: Boolean,
    onTranscriptChange: (String) -> Unit,
    onFocusedSectionChange: (NoteSection?) -> Unit,
    signConfirmPending: Boolean,
    onDismissError: () -> Unit,
    onSignClick: () -> Unit,
) {
    Text(
        text = "Dictation / extra notes",
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.padding(top = if (multiColumn) 0.dp else 8.dp),
    )
    if (multiColumn) {
        Text(
            text = "Tap a field on the left, then use the mic below to dictate into it. Use this area for free-form notes.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    BasicTextField(
        value = sections.additionalNote,
        onValueChange = onTranscriptChange,
        textStyle = TextStyle(
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 17.sp,
            lineHeight = 26.sp,
            fontWeight = FontWeight.Normal,
        ),
        cursorBrush = SolidColor(Cobalt),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = if (multiColumn) 240.dp else 120.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .padding(12.dp)
            .onFocusChanged { focusState ->
                if (focusState.isFocused) onFocusedSectionChange(NoteSection.AdditionalNote)
            },
        enabled = sectionFieldEnabled(uiState, NoteSection.AdditionalNote),
        decorationBox = { inner -> inner() },
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

    SignNoteFooter(
        uiState = uiState,
        signConfirmPending = signConfirmPending,
        onSignClick = onSignClick,
    )
}

/**
 * Subtle inline indicator for the debounced autosave pipeline. Sits next to
 * the "Clinical note" header so the clinician can see at a glance whether
 * their typing is safely persisted.
 *
 * Idle    -> empty (renders nothing)
 * Saving  -> small spinner + "Saving…"
 * Saved   -> muted "Saved" label
 * Offline -> amber "Saved offline — will sync"
 * Error   -> error text (rare; mostly catches Room write failures)
 */
@Composable
private fun AutosaveStatusIndicator(status: AutosaveStatus) {
    when (status) {
        AutosaveStatus.Idle -> Unit
        AutosaveStatus.Saving -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(12.dp),
                strokeWidth = 1.5.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Saving…",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AutosaveStatus.Saved -> Text(
            text = "Saved",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        AutosaveStatus.Offline -> Text(
            text = "Saved offline — will sync",
            style = MaterialTheme.typography.labelSmall,
            color = Amber,
            fontWeight = FontWeight.SemiBold,
        )
        is AutosaveStatus.Error -> Text(
            text = "Save error",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.error,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun sectionFieldEnabled(uiState: DictationUiState, section: NoteSection): Boolean {
    if (uiState.isSubmitting || uiState.isTranscribing) return false
    if (!uiState.isRecording) return true
    return uiState.recordingSection == section
}

@Composable
private fun SectionField(
    label: String?,
    value: String,
    section: NoteSection,
    onValueChange: (String) -> Unit,
    onFocusChange: (NoteSection?) -> Unit,
    enabled: Boolean,
    minLines: Int = 2,
    placeholder: String? = null,
    isRecordingTarget: Boolean = false,
    isTranscribingTarget: Boolean = false,
) {
    val borderColor = when {
        isRecordingTarget -> Amber
        isTranscribingTarget -> Cobalt
        else -> Line
    }
    val focusedBorderColor = when {
        isRecordingTarget -> Amber
        isTranscribingTarget -> Cobalt
        else -> Cobalt
    }
    Column {
        if (label != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                KhMetaText(text = label)
                when {
                    isRecordingTarget -> Text(
                        text = "Recording…",
                        style = MaterialTheme.typography.labelSmall,
                        color = Amber,
                        fontWeight = FontWeight.SemiBold,
                    )
                    isTranscribingTarget -> Text(
                        text = "Transcribing…",
                        style = MaterialTheme.typography.labelSmall,
                        color = Cobalt,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = placeholder?.let { { Text(it) } },
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { focusState ->
                    // Only set on focus gained. We keep "last focused" as the
                    // routing target so tapping a field, blurring, and then
                    // tapping mic still routes into that field — matches the
                    // mental model that the field they were just editing is
                    // the one they want to dictate into.
                    if (focusState.isFocused) onFocusChange(section)
                },
            enabled = enabled,
            minLines = minLines,
            maxLines = 5,
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = focusedBorderColor,
                unfocusedBorderColor = borderColor,
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
private fun SignNoteFooter(
    uiState: DictationUiState,
    signConfirmPending: Boolean,
    onSignClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (signConfirmPending) {
            Text(
                text = "Signing releases this visit from your queue. This cannot be undone from this screen.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Button(
            onClick = onSignClick,
            enabled = uiState.canSubmit,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (signConfirmPending) Green else Cobalt,
                disabledContainerColor = Line,
                disabledContentColor = MaterialTheme.colorScheme.onSurface,
            ),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        ) {
            if (uiState.isSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Color.White,
                )
            } else {
                Text(
                    text = if (signConfirmPending) "Confirm note complete" else "Sign & Complete",
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun DictationBottomToolbar(
    uiState: DictationUiState,
    onToggleWhisper: () -> Unit,
) {
    val activeSection = uiState.recordingSection ?: uiState.transcribingSection
    val statusText = when {
        uiState.isRecording && activeSection != null -> "Recording ${activeSection.displayLabel}…"
        uiState.isTranscribing && activeSection != null -> "Transcribing ${activeSection.displayLabel}…"
        else -> null
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .imePadding(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Line, RoundedCornerShape(0.dp))
                .navigationBarsPadding()
                .padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
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

            if (statusText != null) {
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (uiState.isRecording) Amber else Cobalt,
                )
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
            onFocusedSectionChange = {},
            onDismissError = {},
            onSubmit = {},
            onStructureWithAi = {},
            onToggleWhisper = {},
            onSendToPharmacy = {},
            onAppendPrescriptionLine = {},
        )
    }
}
