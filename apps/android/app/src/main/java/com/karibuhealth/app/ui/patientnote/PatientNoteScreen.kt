package com.karibuhealth.app.ui.patientnote

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.dictation.AutosaveStatus
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Line

/**
 * Phase 3 patient-only note editor. Reuses NoteRepository.saveDraft / signNote
 * (Phase 2) which already accept visitId=null. Single text area + source
 * picker + autosave indicator + Sign Note button — no SOAP form, no
 * documentation_complete chain.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientNoteScreen(
    patientId: String,
    initialSource: String?,
    onNavigateBack: () -> Unit,
    onSigned: () -> Unit,
    viewModel: PatientNoteViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(patientId) {
        viewModel.load(patientId, initialSource)
    }

    LaunchedEffect(uiState.signed) {
        if (uiState.signed) onSigned()
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Column {
                        Text(
                            text = "New note",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        KhMetaText(text = "PATIENT NOTE")
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = {
            PatientNoteBottomBar(
                uiState = uiState,
                onSign = { viewModel.signNote() },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SourcePicker(
                selected = uiState.source,
                enabled = !uiState.isSigning,
                onSelectedChange = viewModel::updateSource,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Note",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                AutosaveStatusIndicator(status = uiState.autosaveStatus)
            }

            BasicTextField(
                value = uiState.transcript,
                onValueChange = viewModel::updateTranscript,
                textStyle = TextStyle(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 17.sp,
                    lineHeight = 26.sp,
                    fontWeight = FontWeight.Normal,
                ),
                cursorBrush = SolidColor(Cobalt),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 260.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, Line, RoundedCornerShape(12.dp))
                    .padding(12.dp),
                enabled = !uiState.isSigning,
                decorationBox = { inner ->
                    if (uiState.transcript.isEmpty()) {
                        Text(
                            text = when (uiState.source) {
                                PatientNoteSource.PHONE_CALL ->
                                    "Phone call summary, advice given, follow-up scheduled..."
                                PatientNoteSource.FOLLOW_UP ->
                                    "Follow-up findings, plan adjustments..."
                                PatientNoteSource.LAB_UPDATE ->
                                    "Lab results, abnormal flags, next steps..."
                                PatientNoteSource.PHARMACY_UPDATE ->
                                    "Dispensing change, stock issue, substitution..."
                                PatientNoteSource.GENERAL ->
                                    "Anything you want preserved on this patient record."
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                        TextButton(onClick = viewModel::dismissError) {
                            Text("Dismiss")
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SourcePicker(
    selected: PatientNoteSource,
    enabled: Boolean,
    onSelectedChange: (PatientNoteSource) -> Unit,
) {
    Column {
        KhMetaText(text = "NOTE TYPE")
        Spacer(Modifier.size(6.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PatientNoteSource.values().forEach { option ->
                FilterChip(
                    selected = option == selected,
                    onClick = { if (enabled) onSelectedChange(option) },
                    enabled = enabled,
                    label = { Text(option.label) },
                )
            }
        }
    }
}

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

@Composable
private fun PatientNoteBottomBar(
    uiState: PatientNoteUiState,
    onSign: () -> Unit,
) {
    val wordCount = uiState.transcript.trim()
        .split(Regex("\\s+"))
        .filter { it.isNotEmpty() }
        .size

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .imePadding(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        Box(
            modifier = Modifier
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
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = when {
                            uiState.signed -> "Signed"
                            uiState.isSigning -> "Signing…"
                            else -> "Autosaves as you type"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    KhMetaText(text = "$wordCount WORDS")
                }
                Button(
                    onClick = onSign,
                    enabled = uiState.canSign,
                    colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    if (uiState.isSigning) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Color.White,
                        )
                    } else {
                        Text("Sign Note", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
